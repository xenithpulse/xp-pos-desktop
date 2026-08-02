// app/loading.tsx
import Loader from "@/pos_modules/shared/Loader";

export default function Loading() {
  return (
    <div className="flex items-center justify-center h-screen w-screen fixed inset-0 bg-black z-50">
      <Loader />
    </div>
  );
}