export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (
      !session?.user ||
      !["admin", "advisor"].includes((session.user as any)?.role ?? "")
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    let clients: any[];
    try {
      clients = await (prisma.cRMClient as any).findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          activityLogs: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });
    } catch (err) {
      console.warn(
        "CRM activity logs unavailable, falling back to clients only:",
        err
      );
      clients = await prisma.cRMClient.findMany({
        orderBy: { updatedAt: "desc" },
      });
    }

    const advisorIds = Array.from(
      new Set(clients.map(c => c.assignedAdvisorId).filter(Boolean))
    ) as string[];
    const advisors = advisorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: advisorIds } },
          select: { id: true, name: true },
        })
      : [];
    const advisorMap = new Map(advisors.map(a => [a.id, a.name]));
    const enriched = clients.map(c => ({
      ...c,
      assignedAdvisorName: c.assignedAdvisorId
        ? advisorMap.get(c.assignedAdvisorId) ?? null
        : null,
    }));

    return NextResponse.json(enriched ?? []);
  } catch (e: any) {
    console.error("CRM clients fetch error:", e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (
      !session?.user ||
      !["admin", "advisor"].includes((session.user as any)?.role ?? "")
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      locality,
      propertiesInterest,
      notes,
      nextContactDate,
      nextContactNote,
    } = body ?? {};
    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "Nombre y apellido son requeridos" },
        { status: 400 }
      );
    }
    const client = await prisma.cRMClient.create({
      data: {
        firstName,
        lastName,
        email: email ?? "",
        phone: phone ?? "",
        locality: locality ?? "",
        propertiesInterest: propertiesInterest ?? [],
        notes: notes ?? "",
        nextContactDate: nextContactDate ? new Date(nextContactDate) : null,
        nextContactNote: nextContactNote ?? "",
        assignedAdvisorId: (session.user as any)?.id ?? null,
      },
    });

    try {
      await prisma.cRMActivityLog.create({
        data: {
          clientId: client.id,
          type: "created",
          title: "Lead creado en base de datos",
          description: "Asesor asignado registró el cliente.",
          createdById: (session.user as any)?.id ?? null,
        },
      });
    } catch (err) {
      console.warn("Could not create CRM activity log:", err);
    }

    return NextResponse.json(client);
  } catch (e: any) {
    console.error("CRM client create error:", e);
    return NextResponse.json(
      { error: "Error al crear cliente" },
      { status: 500 }
    );
  }
}
