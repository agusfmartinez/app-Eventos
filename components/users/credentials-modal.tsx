"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type Credentials = { username: string; temporaryPassword: string };

/**
 * Las credenciales se muestran una sola vez y en un modal: la contraseña se
 * guarda hasheada, así que no hay forma de volver a mostrarla después. Un
 * cartel al costado de la lista se perdía entre las filas.
 */
export function CredentialsModal({
  credentials,
  onClose,
  onCreateAnother,
}: {
  credentials: Credentials | null;
  onClose: () => void;
  /** Solo cuando vienen de un alta: permite encadenar la siguiente. */
  onCreateAnother?: () => void;
}) {
  return (
    <Modal
      open={credentials !== null}
      onClose={onClose}
      title="Credenciales generadas"
      description="Pasáselas a la persona por un canal privado. No se vuelven a mostrar, y se le va a pedir que cambie la contraseña al ingresar."
      footer={
        <>
          {onCreateAnother ? (
            <Button variant="secondary" onClick={onCreateAnother}>
              Crear otro usuario
            </Button>
          ) : null}
          <Button onClick={onClose}>Listo</Button>
        </>
      }
    >
      {credentials ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-ok-surface px-4 py-3 text-sm">
          <dt className="text-ok">Usuario</dt>
          <dd className="font-mono font-bold">{credentials.username}</dd>
          <dt className="text-ok">Contraseña temporal</dt>
          <dd className="font-mono font-bold tracking-wider">
            {credentials.temporaryPassword}
          </dd>
        </dl>
      ) : null}
    </Modal>
  );
}
