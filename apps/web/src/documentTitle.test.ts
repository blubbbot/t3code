import { EnvironmentId, ProjectId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { scopedProjectKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { expect, it, onTestFinished, vi } from "vite-plus/test";
import type { AppRouter } from "./router";
import type { DraftSessionState } from "./composerDraftStore";

const state = await vi.hoisted(async () => {
  const { Atom, AtomRegistry } = await import("effect/reactivity");
  const projects = Atom.make<Record<string, { title: string }>>({}).pipe(Atom.keepAlive);
  const threads = Atom.family((key: string) =>
    Atom.make<{
      environmentId: string;
      projectId: string;
      title: string;
    } | null>(null).pipe(Atom.keepAlive, Atom.withLabel(key)),
  );
  return {
    registry: AtomRegistry.make(),
    projects,
    project: Atom.family((key: string) => Atom.make((get) => get(projects)[key] ?? null)),
    threads,
    config: Atom.make(null),
    drafts: new Map<
      string,
      Pick<DraftSessionState, "environmentId" | "projectId" | "threadId" | "promotedTo">
    >(),
    draftListeners: new Set<() => void>(),
  };
});

vi.mock("./rpc/atomRegistry", () => ({ appAtomRegistry: state.registry }));
vi.mock("./state/projects", () => ({
  environmentProjects: {
    projectsAtom: state.projects,
    projectAtom: (ref: Parameters<typeof scopedProjectKey>[0]) =>
      state.project(scopedProjectKey(ref)),
  },
}));
vi.mock("./state/threads", () => ({
  environmentThreadShells: {
    quietThreadShellAtom: (ref: ScopedThreadRef) => state.threads(scopedThreadKey(ref)),
  },
}));
vi.mock("./state/server", () => ({ primaryServerConfigAtom: state.config }));
vi.mock("./composerDraftStore", () => ({
  useComposerDraftStore: {
    getState: () => ({ getDraftSession: (id: string) => state.drafts.get(id) ?? null }),
    subscribe: (listener: () => void) => {
      state.draftListeners.add(listener);
      return () => state.draftListeners.delete(listener);
    },
  },
}));
vi.mock("./branding", () => ({
  APP_BASE_NAME: "T3 Code",
  APP_DISPLAY_NAME: "T3 Code (Beta)",
  APP_STAGE_LABEL: "Beta",
}));
vi.mock("./env", () => ({ isElectron: true }));

import { startDocumentTitle } from "./documentTitle";

function setup() {
  state.registry.reset();
  state.drafts.clear();
  state.draftListeners.clear();
  vi.stubGlobal("document", { title: "T3 Code (Beta)" });
  onTestFinished(() => {
    state.registry.reset();
    state.draftListeners.clear();
    vi.unstubAllGlobals();
  });
  let resolved = () => {};
  const router = {
    state: {
      matches: [{ routeId: "/draft/$draftId", params: { draftId: "new" } }] as Array<{
        routeId: string;
        params: Record<string, string>;
      }>,
    },
    subscribe: (_event: string, listener: () => void) => {
      resolved = listener;
    },
  };
  const environmentId = EnvironmentId.make("local");
  const projectId = ProjectId.make("project");
  const draft = { environmentId, projectId, threadId: ThreadId.make("reserved"), promotedTo: null };
  state.drafts.set("new", draft);
  const setProject = (
    ref: { environmentId: EnvironmentId; projectId: ProjectId },
    title: string,
  ) => {
    state.registry.update(state.projects, (projects) => ({
      ...projects,
      [scopedProjectKey(ref)]: { title },
    }));
  };
  setProject(draft, "Alpha");
  return {
    router,
    draft,
    setProject,
    resolved: () => resolved(),
    changedDraft: () => state.draftListeners.forEach((listener) => listener()),
  };
}

it("titles an unsent draft after its project and follows project selection and rename", () => {
  const { router, draft, setProject, changedDraft } = setup();
  startDocumentTitle(router as unknown as AppRouter);
  expect(document.title).toBe("Alpha");

  const selected = { ...draft, projectId: ProjectId.make("selected") };
  setProject(selected, "Selected project");
  state.drafts.set("new", selected);
  changedDraft();
  expect(document.title).toBe("Selected project");

  const remote = { ...selected, environmentId: EnvironmentId.make("remote") };
  setProject(remote, "Remote project");
  state.drafts.set("new", remote);
  changedDraft();
  expect(document.title).toBe("Remote project");

  setProject(remote, "Renamed project");
  expect(document.title).toBe("Renamed project");
});

it("keeps project context through promotion, then shows the thread title and clears it on leaving", () => {
  const { router, draft, setProject, resolved, changedDraft } = setup();
  startDocumentTitle(router as unknown as AppRouter);
  const promotedTo = { environmentId: draft.environmentId, threadId: ThreadId.make("sent") };
  state.drafts.set("new", { ...draft, promotedTo });
  changedDraft();
  expect(document.title).toBe("Alpha");

  state.registry.set(state.threads(scopedThreadKey(promotedTo)), { ...draft, title: "Fix login" });
  expect(document.title).toBe("Alpha / Fix login");

  router.state.matches = [{ routeId: "/$environmentId/$threadId", params: promotedTo }];
  resolved();
  state.registry.set(state.threads(scopedThreadKey(promotedTo)), {
    ...draft,
    title: "Renamed thread",
  });
  expect(document.title).toBe("Alpha / Renamed thread");

  const other = { ...draft, projectId: ProjectId.make("other") };
  state.drafts.set("other", other);
  router.state.matches = [{ routeId: "/draft/$draftId", params: { draftId: "other" } }];
  resolved();
  expect(document.title).toBe("T3 Code (Beta)");
  setProject(other, "Other project");
  expect(document.title).toBe("Other project");

  router.state.matches = [];
  resolved();
  state.registry.set(state.threads(scopedThreadKey(promotedTo)), {
    ...draft,
    title: "Old thread changed",
  });
  expect(document.title).toBe("T3 Code (Beta)");
});
