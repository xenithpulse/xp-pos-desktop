// app/lib/authOptions.ts
import { NextAuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { mongooseConnect } from "@/lib/mongoose";
import type { AdminPermission, AdminRole } from "@/models/schemas/admin.schema";
import { resolvePermissions } from "@/types/admin.types";
import bcrypt from "bcrypt";
import { Types } from "mongoose";
import { sendNotification } from "@/lib/helpers/notify";
import { AdminModel } from "@/models/factories/Admin";

export type SessionUser = {
  id: string;
  name: string;
  role: AdminRole;
  permissions: AdminPermission[];
};

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: SessionUser;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    user?: SessionUser;
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || process.env.SECRET,
  session: { strategy: "jwt", maxAge: 720 * 60 }, 
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (!creds) {
          throw new Error("MISSING_CREDENTIALS");
        }
        
        const { username, password } = creds as { username: string; password: string };

        if (!username || !username.trim()) {
          throw new Error("USERNAME_REQUIRED");
        }

        if (!password) {
          throw new Error("PASSWORD_REQUIRED");
        }
        console.log("Connecting to database and verifying credentials...");
        const conn = await mongooseConnect();
        const Admin = AdminModel(conn);
        console.log("Database connected. Looking up user:", username);
        const admin = await Admin.findOne({ username: username.trim() }).lean();
        
        if (!admin) {
          throw new Error("USER_NOT_FOUND");
        }

        if (admin.isActive === false) {
          throw new Error("ACCOUNT_DISABLED");
        }

        const isValid = await bcrypt.compare(password, admin.password);
        if (!isValid) {
          throw new Error("INVALID_PASSWORD");
        }

        const oid = admin._id as Types.ObjectId;
        const userData: SessionUser = {
          id: oid.toString(),
          name: admin.username,
          // Resolved from the role rather than read straight off the document.
          // POST /api/admin creates accounts with a role and no permissions
          // array at all, so `admin.permissions` is empty for every account
          // made through the staff screen - which silently denied those users
          // every permission-gated route. See resolvePermissions().
          role: admin.role,
          permissions: resolvePermissions(admin.role, admin.permissions),
        };

        sendNotification({
          message: `${admin.username} has logged in.`,
          type: "info",
          resource: "Admin",
          resourceId: oid.toString(),
          action: "login",
          createdBy: admin.username,
          recipients: ["all"],
        });

        return userData;
      },
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.user = user as SessionUser;
      return token;
    },
    async session({ session, token }) {
      if (token.user) session.user = token.user;
      return session;
    },
  },
};
