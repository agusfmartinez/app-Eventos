import { Card, StatCard } from "@/components/ui/misc";
import type { EventStats, HourlyBucket } from "@/lib/stats";

function ProgressBar({ entered, capacity }: { entered: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, (entered / capacity) * 100) : 0;

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">Personas ingresadas</p>
        <p className="text-sm font-medium tabular-nums">
          {entered} de {capacity}
          <span className="ml-2 text-muted">{Math.round(pct)}%</span>
        </p>
      </div>

      <div
        className="mt-2 h-3 w-full overflow-hidden rounded-full bg-background"
        role="progressbar"
        aria-valuenow={entered}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-label="Personas ingresadas"
      >
        <div
          className="h-full rounded-full bg-ok transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-muted">{description}</p>
    </div>
  );
}

/**
 * Ritmo de ingresos por hora.
 *
 * Barras horizontales en CSS puro, sin librería de gráficos: son pocas horas y
 * un solo dato por barra. Agregar una dependencia de charts para esto sería
 * cargar cientos de kilobytes para dibujar diez rectángulos.
 */
function HourlyChart({ buckets }: { buckets: HourlyBucket[] }) {
  if (buckets.length === 0) return null;

  const max = Math.max(...buckets.map((b) => b.people));
  const peak = buckets.find((b) => b.people === max);

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Ritmo de ingresos</p>
          <p className="text-xs text-muted">
            Cuánta gente entró en cada hora. Sirve para saber a qué hora se
            arma la cola y reforzar la puerta.
          </p>
        </div>
        {peak ? (
          <p className="shrink-0 text-sm text-muted">
            Pico: {peak.people} a las {peak.hour.split(" ")[1]}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {buckets.map((bucket) => (
          <div key={bucket.hour} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-right text-muted tabular-nums">
              {bucket.hour}
            </span>
            <div className="h-5 min-w-0 flex-1 rounded bg-background">
              <div
                className="flex h-full items-center justify-end rounded bg-brand pr-1.5 text-[10px] font-semibold text-brand-foreground"
                style={{ width: `${Math.max(6, (bucket.people / max) * 100)}%` }}
              >
                {bucket.people}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function EventDashboard({
  stats,
  hourly,
}: {
  stats: EventStats;
  hourly: HourlyBucket[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        title="Durante el evento"
        description="Quién ya está adentro y quién falta. Se actualiza con cada escaneo en la puerta."
      />

      <ProgressBar entered={stats.entered} capacity={stats.capacity} />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Ya ingresaron" value={stats.fullyEntered} tone="ok" />
        <StatCard
          label="Entraron en parte"
          value={stats.partiallyEntered}
          tone="warn"
        />
        <StatCard label="Faltan llegar" value={stats.notArrived} />
      </div>

      <HourlyChart buckets={hourly} />

      <SectionTitle
        title="Antes del evento"
        description="Cómo está armada la lista. Sirve para revisar que no queden invitados sin confirmar antes de la fecha."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Invitados" value={stats.guests} />
        <StatCard label="Habilitados" value={stats.enabled} />
        <StatCard label="Sin confirmar" value={stats.pending} tone="warn" />
        <StatCard label="Bloqueados" value={stats.blocked} tone="deny" />
      </div>
    </div>
  );
}
