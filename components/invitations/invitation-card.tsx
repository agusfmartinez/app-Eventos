import { Download, ExternalLink, MessageCircle } from "lucide-react";

import {
  CopyLinkButton,
  RegenerateButton,
} from "@/components/invitations/invitation-tools";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { formatEventDate } from "@/lib/format";
import {
  invitationImageUrl,
  invitationUrl,
  whatsappLink,
} from "@/lib/invitation-url";
import { qrSvg } from "@/lib/qr";
import { resolveLocation } from "@/lib/venue";

export async function InvitationCard({
  guestId,
  guestName,
  phone,
  token,
  shortCode,
  maxPeople,
  event,
}: {
  guestId: string;
  guestName: string;
  phone: string | null;
  token: string;
  shortCode: string;
  maxPeople: number;
  event: {
    name: string;
    eventDate: Date;
    startTime: string | null;
    location: string | null;
    space?: { address: string | null } | null;
  };
}) {
  const url = invitationUrl(token);
  const svg = await qrSvg(url);

  const wa = whatsappLink({
    phone,
    guestName,
    eventName: event.name,
    dateLabel: formatEventDate(event.eventDate),
    timeLabel: event.startTime,
    location: resolveLocation(event),
    maxPeople,
    token,
  });

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Invitación</h2>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-40 [&>svg]:h-auto [&>svg]:w-full"
            // SVG generado por la librería de QR desde nuestra propia URL.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="font-mono text-base tracking-widest">{shortCode}</p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <p className="text-sm text-muted">Link público</p>
            <p className="mt-0.5 font-mono text-xs break-all">{url}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <CopyLinkButton url={url} />

            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("secondary", "sm")}
            >
              <MessageCircle size={15} />
              Enviar por WhatsApp
            </a>

            <a
              href={invitationImageUrl(token)}
              download={`invitacion-${shortCode}.png`}
              className={buttonClass("secondary", "sm")}
            >
              <Download size={15} />
              Descargar imagen
            </a>

            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("ghost", "sm")}
            >
              <ExternalLink size={15} />
              Ver como el invitado
            </a>
          </div>

          <div className="border-t border-border pt-3">
            <RegenerateButton guestId={guestId} />
            <p className="mt-1 text-xs text-muted">
              Regenerar invalida el link y el QR que ya hayas enviado.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
