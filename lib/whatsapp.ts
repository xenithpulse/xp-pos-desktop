// lib/whatsapp.ts
import axios from "axios";

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
const version = process.env.WHATSAPP_API_VERSION || "v20.0";

const apiBase = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

export async function sendWhatsAppMessage(to: string, message: string) {
  try {
    const res = await axios.post(
      apiBase,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.data;
  } catch (err) {
    console.error("WhatsApp API Error:", err || err);
    throw err;
  }
}
