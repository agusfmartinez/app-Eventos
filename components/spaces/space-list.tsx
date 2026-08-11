"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Power } from "lucide-react";

import { SpaceForm } from "@/components/spaces/space-form";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import {
  createSpaceAction,
  toggleSpaceActiveAction,
  updateSpaceAction,
} from "@/lib/actions/spaces";

export type SpaceRow = {
  id: string;
  name: string;
  capacity: number | null;
  notes: string | null;
  active: boolean;
  eventCount: number;
};

function ToggleActive({ space }: { space: SpaceRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await toggleSpaceActiveAction(space.id);
            if (result.error) setError(result.error);
          })
        }
      >
        <Power size={15} />
        {space.active ? "Desactivar" : "Activar"}
      </Button>
      {error ? <p className="text-xs text-deny">{error}</p> : null}
    </div>
  );
}

function SpaceRowItem({ space }: { space: SpaceRow }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="p-4">
        <SpaceForm
          action={updateSpaceAction.bind(null, space.id)}
          submitLabel="Guardar cambios"
          defaultValues={{
            name: space.name,
            capacity: space.capacity?.toString() ?? "",
            notes: space.notes ?? "",
            active: space.active,
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
        <p className="flex items-center gap-2 font-medium">
          {space.name}
          {!space.active ? <Badge tone="neutral">Inactivo</Badge> : null}
        </p>
        <p className="text-sm text-muted">
          {space.capacity ? `Capacidad: ${space.capacity} · ` : ""}
          {space.eventCount} {space.eventCount === 1 ? "evento" : "eventos"}
          {space.notes ? ` · ${space.notes}` : ""}
        </p>
      </div>

      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        <Pencil size={15} />
        Editar
      </Button>

      <ToggleActive space={space} />
    </div>
  );
}

export function SpaceList({ spaces }: { spaces: SpaceRow[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Nuevo espacio</h2>
          <SpaceForm
            action={createSpaceAction}
            submitLabel="Crear espacio"
            resetOnSuccess
            cancel={
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreating(false)}
              >
                Cerrar
              </Button>
            }
          />
        </Card>
      ) : (
        <div>
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            Nuevo espacio
          </Button>
        </div>
      )}

      {spaces.length === 0 ? (
        <EmptyState
          title="Todavía no hay espacios"
          description="Cargá los ambientes del salón que se alquilan por separado. Si el salón es uno solo, podés saltear esto."
        />
      ) : (
        <Card className="divide-y divide-border">
          {spaces.map((space) => (
            <SpaceRowItem key={space.id} space={space} />
          ))}
        </Card>
      )}
    </div>
  );
}
