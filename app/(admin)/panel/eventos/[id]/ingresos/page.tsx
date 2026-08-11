import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Search, Ticket } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { requireAdminOrOrganizer } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatDateTime, guestFullName } from "@/lib/format";
import { digitsOnly } from "@/lib/validators/guest";

export const dynamic = "force-dynamic";

// Un evento grande puede tener cientos de ingresos. Se pagina para no traer
// todo el historial en cada carga.
const PAGE_SIZE = 50;

export default async function IngresosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdminOrOrganizer();
  const { id } = await params;
  const { q = "", page = "1" } = await searchParams;

  const query = q.trim();
  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!event) notFound();

  const digits = digitsOnly(query);
  const where = {
    eventId: id,
    ...(query
      ? {
          guest: {
            OR: [
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
              ...(digits ? [{ phone: { contains: digits } }] : []),
            ],
          },
        }
      : {}),
  };

  const [checkIns, total, totals] = await Promise.all([
    prisma.checkIn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        peopleCount: true,
        createdAt: true,
        stationLabel: true,
        guest: { select: { id: true, firstName: true, lastName: true } },
        operator: { select: { fullName: true } },
      },
    }),
    prisma.checkIn.count({ where }),
    // Totales del evento completo, no del filtro ni de la página.
    prisma.checkIn.aggregate({
      where: { eventId: id },
      _sum: { peopleCount: true },
      _count: true,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buildHref = (nextPage: number) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (nextPage > 1) sp.set("page", String(nextPage));
    const qs = sp.toString();
    return `/panel/eventos/${id}/ingresos${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Historial de ingresos"
        subtitle={
          <>
            {event.name} · {totals._count} registros ·{" "}
            {totals._sum.peopleCount ?? 0} personas
          </>
        }
        actions={
          <>
            <ButtonLink
              href={`/panel/eventos/${id}/export/ingresos`}
              variant="secondary"
            >
              <Download size={16} />
              Exportar CSV
            </ButtonLink>
            <ButtonLink href={`/panel/eventos/${id}`} variant="secondary">
              <ArrowLeft size={16} />
              Volver
            </ButtonLink>
          </>
        }
      />

      <form className="flex items-center gap-2">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
          />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Buscar por invitado o teléfono"
            className="w-72 pl-8"
            aria-label="Buscar ingresos"
          />
        </div>
        {query ? (
          <ButtonLink
            href={`/panel/eventos/${id}/ingresos`}
            variant="ghost"
            size="sm"
          >
            Limpiar
          </ButtonLink>
        ) : null}
      </form>

      {checkIns.length === 0 ? (
        <EmptyState
          icon={<Ticket size={28} />}
          title={
            query
              ? "Ningún ingreso coincide con la búsqueda"
              : "Todavía no se registraron ingresos"
          }
          description={
            query
              ? `No se encontró nada para “${query}”.`
              : "Los ingresos aparecen acá a medida que el personal de puerta escanea."
          }
        />
      ) : (
        <>
          <Card className="divide-y divide-border">
            {checkIns.map((checkIn) => (
              <div
                key={checkIn.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm"
              >
                <Link
                  href={`/panel/eventos/${id}/invitados/${checkIn.guest.id}`}
                  className="min-w-0 flex-1 font-medium hover:text-brand"
                >
                  {guestFullName(checkIn.guest)}
                </Link>

                <span className="tabular-nums">
                  <strong>{checkIn.peopleCount}</strong>{" "}
                  {checkIn.peopleCount === 1 ? "persona" : "personas"}
                </span>

                <span className="text-muted tabular-nums">
                  {formatDateTime(checkIn.createdAt)}
                </span>

                <span className="text-muted">
                  {checkIn.stationLabel ?? "—"}
                  {checkIn.operator ? ` · ${checkIn.operator.fullName}` : ""}
                </span>
              </div>
            ))}
          </Card>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">
                Página {currentPage} de {totalPages}
              </span>
              <div className="flex gap-2">
                {currentPage > 1 ? (
                  <ButtonLink
                    href={buildHref(currentPage - 1)}
                    variant="secondary"
                    size="sm"
                  >
                    Anterior
                  </ButtonLink>
                ) : null}
                {currentPage < totalPages ? (
                  <ButtonLink
                    href={buildHref(currentPage + 1)}
                    variant="secondary"
                    size="sm"
                  >
                    Siguiente
                  </ButtonLink>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
