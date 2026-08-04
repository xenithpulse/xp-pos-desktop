// lib/whatsapp.ts
import axios from "axios";

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const version = process.env.WHATSAPP_API_VERSION || "v20.0";

const apiBase = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

/**
 * Lets call sites skip cleanly on boxes that haven't set up WhatsApp yet,
 * instead of every send throwing on the missing env vars.
 */
export function isWhatsAppConfigured(): boolean {
  return !!phoneNumberId && !!accessToken;
}

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
