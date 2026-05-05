"use client";

import { TaskPriority } from "@prisma/client";
import { useTransition } from "react";
import { ActionButton } from "@/app/components/ui/action-button";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate, formatPriority, priorityTone } from "@/app/(platform)/compliance/bizsafe/components/helpers";
import type { BizsafeTaskDto } from "@/app/(platform)/compliance/bizsafe/components/types";

export type BizsafeTaskCreatePayload = {
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  assignedTo: string | null;
};

export type BizsafeTaskUpdatePayload = Partial<BizsafeTaskCreatePayload> & { isCompleted?: boolean };

export function BizsafeTaskList(props: {
  tasks: BizsafeTaskDto[];
  missingRequirements: string[];
  canEdit: boolean;
  onCreateTask: (payload: BizsafeTaskCreatePayload) => Promise<void>;
  onUpdateTask: (taskId: string, payload: BizsafeTaskUpdatePayload) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    const payload: BizsafeTaskCreatePayload = {
      title: String(formData.get("title") ?? ""),
      description: toNullable(formData.get("description")),
      dueDate: toNullable(formData.get("dueDate")),
      priority: String(formData.get("priority") ?? TaskPriority.MEDIUM) as TaskPriority,
      assignedTo: toNullable(formData.get("assignedTo")),
    };

    startTransition(async () => {
      await props.onCreateTask(payload);
    });
  }

  return (
    <SectionCard title="Required Actions" description="Manual tasks plus automatically detected compliance gaps.">
      <div className="space-y-4">
        {props.missingRequirements.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">Missing requirements affecting readiness</p>
            <ul className="mt-3 space-y-2 text-sm text-amber-900">
              {props.missingRequirements.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-3">
          {props.tasks.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-neutral-600">
              No custom BizSAFE action items yet.
            </div>
          ) : (
            props.tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm font-semibold ${task.isCompleted ? "text-neutral-500 line-through" : "text-neutral-950"}`}>
                        {task.title}
                      </p>
                      <StatusPill tone={priorityTone(task.priority)}>{formatPriority(task.priority)}</StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-neutral-600">{task.description ?? "No description"}</p>
                    <p className="mt-2 text-xs text-neutral-500">
                      Due {formatDate(task.dueDate)} · Assigned to {task.assignedTo ?? "-"}
                    </p>
                  </div>

                  {props.canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        variant={task.isCompleted ? "secondary" : "primary"}
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await props.onUpdateTask(task.id, { isCompleted: !task.isCompleted });
                          })
                        }
                      >
                        {task.isCompleted ? "Reopen" : "Mark Done"}
                      </ActionButton>
                      <ActionButton
                        variant="danger"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await props.onDeleteTask(task.id);
                          })
                        }
                      >
                        Delete
                      </ActionButton>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {props.canEdit ? (
          <form action={handleCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
            <Field label="Task Title" name="title" required />
            <Field label="Assigned To" name="assignedTo" />
            <Field label="Due Date" name="dueDate" type="date" />
            <SelectField
              label="Priority"
              name="priority"
              defaultValue={TaskPriority.MEDIUM}
              options={Object.values(TaskPriority).map((priority) => ({
                value: priority,
                label: formatPriority(priority),
              }))}
            />
            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Description</label>
              <textarea
                name="description"
                className="mt-2 h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div className="lg:col-span-2 flex justify-end">
              <ActionButton type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Add Action"}
              </ActionButton>
            </div>
          </form>
        ) : null}
      </div>
    </SectionCard>
  );
}

function toNullable(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function Field(props: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-900">{props.label}</label>
      <input
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}

function SelectField(props: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-900">{props.label}</label>
      <select
        name={props.name}
        defaultValue={props.defaultValue}
        className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
