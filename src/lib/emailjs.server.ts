import { getServerConfig } from "@/lib/config.server";

type EmailJsSendResult = {
  sent: boolean;
  status?: number;
  text?: string;
  reason?: string;
};

function getEmailJsConfig() {
  const config = getServerConfig().emailjs;
  return {
    serviceId: config.serviceId || process.env.EMAILJS_SERVICE_ID,
    publicKey: config.publicKey || process.env.EMAILJS_PUBLIC_KEY,
    privateKey: config.privateKey || process.env.EMAILJS_PRIVATE_KEY,
  };
}

export async function sendEmailJsTemplate(
  templateId: string | undefined,
  templateParams: Record<string, unknown>,
): Promise<EmailJsSendResult> {
  const { serviceId, publicKey, privateKey } = getEmailJsConfig();

  if (!serviceId || !publicKey || !templateId) {
    return {
      sent: false,
      reason: "EmailJS is not configured on the server.",
    };
  }

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      ...(privateKey ? { accessToken: privateKey } : {}),
      template_params: templateParams,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`EmailJS request failed (${response.status}): ${text || response.statusText}`);
  }

  return {
    sent: true,
    status: response.status,
    text,
  };
}
