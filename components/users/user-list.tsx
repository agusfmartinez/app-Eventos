"use client";

import { useState, useTransition } from "react";
import { KeyRound, Pencil, Plus, Power } from "lucide-react";

import {
  CredentialsModal,
  type Credentials,
} from "@/components/users/credentials-modal";
import { UserForm } from "@/components/users/user-form";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/modal";
import {
  createUserAction,
  resetPasswordAction,
  toggleUserActiveAction,
  updateUserAction,
} from "@/lib/actions/users";
import { ROLE_LABELS } from "@/lib/format";
import type { Role } from "@/lib/generated/prisma/enums";

export type UserRow = {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  assignedEvents: number;
};

const roleTone: Record<Role, "neutral" | "ok" | "warn" | "deny"> = {
  ADMIN: "deny",
  ORGANIZER: "warn",
  DOOR: "neutral",
};

function RowActions({
  user,
  isSelf,
  onCredentials,
}: {
  user: UserRow;
  isSelf: boolean;
  onCredentials: (credentials: Credentials) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  function resetPassword() {
    setError(null);
    startTransition(async () => {
      const result = await resetPasswordAction(user.id);
      setAsking(false);
      if (result.error) setError(result.error);
      if (result.credentials) onCredentials(result.credentials);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAsking(true)}
          disabled={pending}
          title="Generar una contraseña temporal nueva"
        >
          <KeyRound size={15} />
          <span className="hidden sm:inline">Resetear clave</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={pending || isSelf}
          title={isSelf ? "No podés desactivar tu propia cuenta" : undefined}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await toggleUserActiveAction(user.id);
              if (result.error) setError(result.error);
            })
          }
        >
          <Power size={15} />
          {user.active ? "Desactivar" : "Activar"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-deny">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={resetPassword}
        pending={pending}
        title={`Resetear la clave de ${user.username}`}
        confirmLabel="Generar contraseña"
        description={"Se genera una contraseña temporal nueva y se muestra en pantalla. La actual deja de funcionar y el usuario deberá generar una nueva al ingresar."}
      />
    </div>
  );
}

function UserRowItem({
  user,
  currentUserId,
  onCredentials,
}: {
  user: UserRow;
  currentUserId: string;
  onCredentials: (credentials: Credentials) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isSelf = user.id === currentUserId;

  if (editing) {
    return (
      <div className="p-4">
        <UserForm
          action={updateUserAction.bind(null, user.id)}
          submitLabel="Guardar cambios"
          isSelf={isSelf}
          lockedUsername={user.username}
          onSuccess={() => setEditing(false)}
          defaultValues={{
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email ?? "",
            role: user.role,
          }}
          cancel={
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <span className="font-mono">{user.username}</span>
          <span className="text-muted">
            {user.firstName} {user.lastName}
          </span>
          <Badge tone={roleTone[user.role]}>{ROLE_LABELS[user.role]}</Badge>
          {!user.active ? <Badge tone="neutral">Inactivo</Badge> : null}
          {user.mustChangePassword ? (
            <Badge tone="warn">Clave temporal</Badge>
          ) : null}
          {isSelf ? <Badge tone="neutral">Yo</Badge> : null}
        </p>
        <p className="text-sm text-muted">
          {user.email ?? "sin email"}
          {user.role === "DOOR"
            ? ` · ${user.assignedEvents} ${user.assignedEvents === 1 ? "evento asignado" : "eventos asignados"}`
            : ""}
        </p>
      </div>

      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        <Pencil size={15} />
        Editar
      </Button>

      <RowActions
        user={user}
        isSelf={isSelf}
        onCredentials={onCredentials}
      />
    </div>
  );
}

export function UserList({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [creating, setCreating] = useState(false);

  // Remontar el formulario es la única forma de limpiar de verdad el estado
  // de la Server Action. Sin esto, las credenciales del alta anterior siguen
  // vivas y reaparecen sobre el formulario del siguiente usuario.
  const [formInstance, setFormInstance] = useState(0);

  const [credentials, setCredentials] = useState<Credentials | null>(null);
  // Solo el alta encadena: después de un reseteo no tiene sentido ofrecer
  // "crear otro usuario".
  const [fromCreate, setFromCreate] = useState(false);

  function startNewForm() {
    setCredentials(null);
    setFormInstance((n) => n + 1);
    setCreating(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Nuevo usuario</h2>
          <UserForm
            key={formInstance}
            action={createUserAction}
            submitLabel="Crear usuario"
            onSuccess={(state) => {
              setCreating(false);
              if (state.credentials) {
                setFromCreate(true);
                setCredentials(state.credentials);
              }
            }}
            cancel={
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCreating(false);
                  setFormInstance((n) => n + 1);
                }}
              >
                Cerrar
              </Button>
            }
          />
        </Card>
      ) : (
        <div>
          <Button onClick={startNewForm}>
            <Plus size={16} />
            Nuevo usuario
          </Button>
        </div>
      )}

      <Card className="divide-y divide-border">
        {users.map((user) => (
          <UserRowItem
            key={user.id}
            user={user}
            currentUserId={currentUserId}
            onCredentials={(next) => {
              setFromCreate(false);
              setCredentials(next);
            }}
          />
        ))}
      </Card>

      <CredentialsModal
        credentials={credentials}
        onClose={() => setCredentials(null)}
        onCreateAnother={fromCreate ? startNewForm : undefined}
      />
    </div>
  );
}
