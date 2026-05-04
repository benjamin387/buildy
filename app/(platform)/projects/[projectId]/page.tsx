import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission, ProjectRole, TaskPriority, TaskStatus } from "@prisma/client";
import { getProjectById } from "@/lib/projects/service";
import { getProjectPermissions, requireUserId } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ProjectSummaryCards } from "@/app/(platform)/projects/components/project-summary-cards";
import {
  createMilestoneAction,
  createProgressLogAction,
  createRoleAssignmentAction,
  createTaskAction,
} from "@/app/(platform)/projects/actions";
import { CopyLinkButton } from "@/app/(platform)/components/copy-link-button";
import { generateClientPortalInviteAction, setClientPortalMessageStatusAction, upsertClientPortalAccountAction } from "@/app/(platform)/projects/[projectId]/client-portal/actions";
import { AISalesAssistantPanel } from "@/app/(platform)/components/ai-sales-assistant-panel";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ProjectDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const userId = await requireUserId();
  const permissions = await getProjectPermissions({ userId, projectId });
  const canWrite = permissions.has(Permission.PROJECT_WRITE);
  const canComms = permissions.has(Permission.COMMS_WRITE) || permissions.has(Permission.COMMS_READ);

  const project = await getProjectById(projectId);
  if (!project) notFound();

  const sp = await searchParams;
  const showPortal = typeof sp.portal === "string" ? sp.portal : "";
  const inviteLink = typeof sp.inviteLink === "string" ? sp.inviteLink : "";

  const portalAccount = await prisma.clientPortalAccount.findFirst({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
  });

  const portalMessages = portalAccount
    ? await prisma.clientPortalMessage.findMany({
        where: { projectId },
        orderBy: [{ createdAt: "desc" }],
        take: 10,
      })
    : [];

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Project Dashboard
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Overview
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Track commercial snapshot, milestones, tasks, progress logs, and role assignments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/edit`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Edit Project
          </Link>
        </div>
      </div>

      <ProjectSummaryCards
        contractValue={Number(project.revisedContractValue) > 0 ? Number(project.revisedContractValue) : Number(project.contractValue)}
        estimatedCost={Number(project.estimatedCost)}
        projectedProfit={Number(project.projectedProfit)}
        targetCompletionDate={project.targetCompletionDate}
      />

      <AISalesAssistantPanel
        projectId={projectId}
        returnTo={`/projects/${projectId}#ai-sales`}
        mode="PROJECT"
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <InfoCard title="Project Info">
          <InfoRow label="Project Code" value={project.projectCode ?? "-"} />
          <InfoRow label="Project Type" value={project.projectType} />
          <InfoRow label="Status" value={project.status} />
          <InfoRow label="Start Date" value={formatDate(project.startDate)} />
          <InfoRow
            label="Target Completion"
            value={formatDate(project.targetCompletionDate)}
          />
          <InfoRow
            label="Actual Completion"
            value={formatDate(project.actualCompletionDate)}
          />
        </InfoCard>

        <InfoCard title="Client & Site">
          <InfoRow label="Client Name" value={project.clientName} />
          <InfoRow label="Client Company" value={project.clientCompany ?? "-"} />
          <InfoRow label="Client Email" value={project.clientEmail ?? "-"} />
          <InfoRow label="Client Phone" value={project.clientPhone ?? "-"} />
          <InfoRow label="Site Address" value={project.siteAddress} />
        </InfoCard>
      </section>

      <InfoCard title="Client Portal">
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">
            Invite a client to the portal to view presentation, quotation, contract, invoices, and progress without internal admin data.
          </p>

          {portalAccount ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Name" value={portalAccount.name} />
                <InfoRow label="Email" value={portalAccount.email} />
                <InfoRow label="Phone" value={portalAccount.phone ?? "-"} />
                <InfoRow label="Last login" value={portalAccount.lastLoginAt ? formatDate(portalAccount.lastLoginAt) : "-"} />
              </div>

              {inviteLink ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <CopyLinkButton text={inviteLink} label="Copy portal link" />
                  <a
                    href={inviteLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                  >
                    Open link
                  </a>
                </div>
              ) : null}

              {canComms ? (
                <form action={generateClientPortalInviteAction} className="mt-4 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="email" value={portalAccount.email} />
                  <label className="grid gap-2 text-sm sm:col-span-1">
                    <span className="font-medium text-neutral-800">Channel</span>
                    <select
                      name="channel"
                      defaultValue="EMAIL"
                      className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                    >
                      <option value="EMAIL">Email</option>
                      <option value="WHATSAPP">WhatsApp</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" name="sendNow" defaultChecked className="h-4 w-4" />
                    <span className="text-neutral-700">
                      Send invite now (requires provider env)
                    </span>
                  </label>
                  <div className="flex justify-end sm:col-span-1">
                    <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                      Send Portal Invite
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm text-neutral-700">No portal account linked to this project yet.</p>
              {canWrite ? (
                <form action={upsertClientPortalAccountAction} className="mt-4 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="projectId" value={projectId} />
                  <label className="grid gap-2 text-sm sm:col-span-1">
                    <span className="font-medium text-neutral-800">Name</span>
                    <input
                      name="name"
                      required
                      defaultValue={project.clientName || ""}
                      className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm sm:col-span-1">
                    <span className="font-medium text-neutral-800">Email</span>
                    <input
                      name="email"
                      required
                      type="email"
                      defaultValue={project.clientEmail ?? ""}
                      className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm sm:col-span-1">
                    <span className="font-medium text-neutral-800">Phone</span>
                    <input
                      name="phone"
                      defaultValue={project.clientPhone ?? ""}
                      className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    />
                  </label>
                  <div className="flex justify-end sm:col-span-3">
                    <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                      Create Portal Account
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          )}

          {portalMessages.length > 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Client Messages
                </p>
              </div>
              <div className="divide-y divide-neutral-200">
                {portalMessages.map((m) => (
                  <div key={m.id} className="px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-neutral-950">{m.subject}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{m.message}</p>
                        <p className="mt-2 text-xs text-neutral-500">
                          Status: {m.status} · {formatDate(m.createdAt)}
                        </p>
                      </div>
                      <form action={setClientPortalMessageStatusAction} className="flex items-center gap-2">
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="messageId" value={m.id} />
                        <select
                          name="status"
                          defaultValue={m.status}
                          className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                        >
                          <option value="NEW">NEW</option>
                          <option value="READ">READ</option>
                          <option value="RESOLVED">RESOLVED</option>
                          <option value="ARCHIVED">ARCHIVED</option>
                        </select>
                        <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Update
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : showPortal && portalAccount ? (
            <p className="text-sm text-neutral-600">No client messages yet.</p>
          ) : null}
        </div>
      </InfoCard>

      <InfoCard title="Commercial Snapshot">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Contract Value" value={formatCurrency(Number(project.contractValue))} />
          <Metric label="Revised Contract Value" value={formatCurrency(Number(project.revisedContractValue))} />
          <Metric label="Estimated Cost" value={formatCurrency(Number(project.estimatedCost))} />
          <Metric label="Committed Cost" value={formatCurrency(Number(project.committedCost))} />
          <Metric label="Actual Cost" value={formatCurrency(Number(project.actualCost))} />
          <Metric label="Projected Profit" value={formatCurrency(Number(project.projectedProfit))} />
        </div>

        {project.notes ? (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Notes
            </p>
            <p className="mt-2 whitespace-pre-wrap leading-6">{project.notes}</p>
          </div>
        ) : null}
      </InfoCard>

      <section className="grid gap-6 lg:grid-cols-2">
        <InfoCard title="Milestones">
          {project.milestones.length === 0 ? (
            <p className="text-sm text-neutral-600">No milestones yet.</p>
          ) : (
            <div className="space-y-3">
              {project.milestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">
                        {milestone.title}
                      </p>
                      <p className="mt-1 text-xs text-neutral-600">
                        Status: {milestone.status} · Due {formatDate(milestone.dueDate)}
                      </p>
                      {milestone.description ? (
                        <p className="mt-2 text-sm text-neutral-700">
                          {milestone.description}
                        </p>
                      ) : null}
                    </div>
                    <span className="inline-flex rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-neutral-800">
                      {milestone.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {canWrite ? (
            <form action={createMilestoneAction} className="mt-5 grid gap-3">
              <input type="hidden" name="projectId" value={projectId} />
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  name="title"
                  required
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
                  placeholder="Milestone title"
                />
                <input
                  name="dueDate"
                  type="date"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                />
              </div>
              <textarea
                name="description"
                rows={2}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Description (optional)"
              />
              <div className="flex justify-end">
                <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                  Add Milestone
                </button>
              </div>
            </form>
          ) : null}
        </InfoCard>

        <InfoCard title="Role Assignments">
          {project.roleAssignments.length === 0 ? (
            <p className="text-sm text-neutral-600">No role assignments yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Email</th>
                    <th className="px-4 py-3 text-left font-semibold">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {project.roleAssignments.map((assignment) => (
                    <tr key={assignment.id} className="border-t border-neutral-200">
                      <td className="px-4 py-3 font-medium text-neutral-900">
                        {assignment.userName}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {assignment.userEmail}
                      </td>
                      <td className="px-4 py-3 text-neutral-900">{assignment.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canWrite ? (
            <form action={createRoleAssignmentAction} className="mt-5 grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="projectId" value={projectId} />
              <input
                name="userName"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
                placeholder="User name"
              />
              <input
                name="userEmail"
                type="email"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
                placeholder="user@email.com"
              />
              <select
                name="role"
                defaultValue={ProjectRole.PROJECT_MANAGER}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
              >
                <option value={ProjectRole.OWNER}>Owner</option>
                <option value={ProjectRole.PROJECT_MANAGER}>Project Manager</option>
                <option value={ProjectRole.DESIGNER}>Designer</option>
                <option value={ProjectRole.QS}>QS</option>
                <option value={ProjectRole.SITE_SUPERVISOR}>Site Supervisor</option>
                <option value={ProjectRole.FINANCE}>Finance</option>
                <option value={ProjectRole.ADMIN}>Admin</option>
                <option value={ProjectRole.VIEWER}>Viewer</option>
              </select>
              <div className="sm:col-span-2 flex justify-end">
                <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                  Add Role
                </button>
              </div>
            </form>
          ) : null}
        </InfoCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <InfoCard title="Tasks">
          {project.tasks.length === 0 ? (
            <p className="text-sm text-neutral-600">No tasks yet.</p>
          ) : (
            <div className="space-y-3">
              {project.tasks.slice(0, 12).map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {task.status} · {task.priority} · Due {formatDate(task.dueDate)}
                      </p>
                      {task.assignedTo || task.assignedEmail ? (
                        <p className="mt-2 text-xs text-neutral-600">
                          Assigned: {task.assignedTo ?? "-"}{" "}
                          {task.assignedEmail ? `(${task.assignedEmail})` : ""}
                        </p>
                      ) : null}
                    </div>
                    <span className="inline-flex rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-neutral-800">
                      {task.progressPercent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {canWrite ? (
            <form action={createTaskAction} className="mt-5 grid gap-3">
              <input type="hidden" name="projectId" value={projectId} />
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  name="title"
                  required
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
                  placeholder="Task title"
                />
                <input
                  name="dueDate"
                  type="date"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <select
                  name="priority"
                  defaultValue={TaskPriority.MEDIUM}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                >
                  <option value={TaskPriority.LOW}>Low</option>
                  <option value={TaskPriority.MEDIUM}>Medium</option>
                  <option value={TaskPriority.HIGH}>High</option>
                  <option value={TaskPriority.CRITICAL}>Critical</option>
                </select>
                <select
                  name="status"
                  defaultValue={TaskStatus.TODO}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                >
                  <option value={TaskStatus.TODO}>To do</option>
                  <option value={TaskStatus.IN_PROGRESS}>In progress</option>
                  <option value={TaskStatus.DONE}>Done</option>
                  <option value={TaskStatus.BLOCKED}>Blocked</option>
                  <option value={TaskStatus.CANCELLED}>Cancelled</option>
                </select>
                <input
                  name="progressPercent"
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  defaultValue={0}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                  placeholder="%"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="assignedTo"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                  placeholder="Assigned to (name)"
                />
                <input
                  name="assignedEmail"
                  type="email"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                  placeholder="Assigned email"
                />
              </div>
              <textarea
                name="description"
                rows={2}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Description (optional)"
              />
              <div className="flex justify-end">
                <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                  Add Task
                </button>
              </div>
            </form>
          ) : null}
        </InfoCard>

        <InfoCard title="Progress Logs">
          {project.progressLogs.length === 0 ? (
            <p className="text-sm text-neutral-600">No progress logs yet.</p>
          ) : (
            <div className="space-y-3">
              {project.progressLogs.slice(0, 10).map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">
                        {log.title}
                      </p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {formatDate(log.logDate)} · {log.progressPercent}% · {log.createdBy}
                      </p>
                      <p className="mt-2 text-sm text-neutral-700">
                        {log.description}
                      </p>
                      {log.delayReason ? (
                        <p className="mt-2 text-xs text-neutral-600">
                          Delay reason: {log.delayReason}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {canWrite ? (
            <form action={createProgressLogAction} className="mt-5 grid gap-3">
              <input type="hidden" name="projectId" value={projectId} />
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  name="logDate"
                  type="date"
                  required
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                />
                <input
                  name="progressPercent"
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  required
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                  placeholder="Progress %"
                />
                <input
                  name="title"
                  required
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                  placeholder="Title"
                />
              </div>
              <textarea
                name="description"
                required
                rows={3}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Description"
              />
              <input
                name="delayReason"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Delay reason (optional)"
              />
              <div className="flex justify-end">
                <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                  Add Log
                </button>
              </div>
            </form>
          ) : null}
        </InfoCard>
      </section>
    </main>
  );
}

function InfoCard(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-neutral-950">{props.title}</h3>
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-6 text-sm">
      <span className="text-neutral-600">{props.label}</span>
      <span className="font-medium text-neutral-900 text-right">{props.value}</span>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.label}
      </p>
      <p className="mt-2 text-lg font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}
