"use client";

import { useState, useTransition } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { regenerateInvitationAction } from "@/lib/actions/invitations";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS): que al menos pueda
      // seleccionar el texto a mano.
      window.prompt("Copiá el link de la invitación:", url);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? "Copiado" : "Copiar link"}
    </Button>
  );
}

export function RegenerateButton({ guestId }: { guestId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateInvitationAction(guestId);
      setAsking(false);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setAsking(true)}
        disabled={pending}
      >
        <RefreshCw size={15} />
        {pending ? "Regenerando…" : "Regenerar"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-deny">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={regenerate}
        pending={pending}
        variant="danger"
        title="Regenerar la invitación"
        confirmLabel="Regenerar"
        description="Se genera un link y un QR nuevos: la invitación que ya hayas enviado deja de funcionar. Los ingresos ya registrados no se modifican."
      />
    </div>
  );
}
