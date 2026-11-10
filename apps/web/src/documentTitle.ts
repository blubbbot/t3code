import {
  scopedThreadKey,
  scopedProjectKey,
  scopeProjectRef,
} from "@t3tools/client-runtime/environment";
import { APP_BASE_NAME, APP_DISPLAY_NAME, APP_STAGE_LABEL } from "./branding";
import { resolveServerBackedAppDisplayName, resolveWindowTitle } from "./branding.logic";
import { useComposerDraftStore } from "./composerDraftStore";
import { isElectron } from "./env";
import type { AppRouter } from "./router";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { environmentProjects } from "./state/projects";
import { primaryServerConfigAtom } from "./state/server";
import { environmentThreadShells } from "./state/threads";
import { resolveActiveThreadRouteRef, resolveThreadRouteTarget } from "./threadRoutes";

function readOpenContext(router: AppRouter) {
  const target = resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});
  const draft =
    target?.kind === "draft"
      ? useComposerDraftStore.getState().getDraftSession(target.draftId)
      : null;
  return {
    threadRef: resolveActiveThreadRouteRef(target, draft),
    draftProjectRef: draft ? scopeProjectRef(draft.environmentId, draft.projectId) : null,
  };
}

/** Names the open thread and its project in the window title, or the app when none is open. */
export function startDocumentTitle(router: AppRouter): void {
  const readOnGuestPage = () => router.state.matches.some((match) => match.routeId === "/guest");
  let { threadRef: openThreadRef, draftProjectRef } = readOpenContext(router);
  let onGuestPage = readOnGuestPage();
  const write = () => {
    // GuestPage titles the tab after the shared thread.
    if (onGuestPage) return;
    const thread =
      openThreadRef === null
        ? null
        : appAtomRegistry.get(environmentThreadShells.quietThreadShellAtom(openThreadRef));
    const projectRef = thread
      ? scopeProjectRef(thread.environmentId, thread.projectId)
      : draftProjectRef;
    const project = projectRef
      ? appAtomRegistry.get(environmentProjects.projectAtom(projectRef))
      : null;
    const title = resolveWindowTitle({
      appDisplayName: resolveServerBackedAppDisplayName({
        baseName: APP_BASE_NAME,
        fallbackDisplayName: APP_DISPLAY_NAME,
        fallbackStageLabel: APP_STAGE_LABEL,
        primaryServerVersion:
          appAtomRegistry.get(primaryServerConfigAtom)?.environment.serverVersion ?? null,
      }),
      projectTitle: project?.title ?? null,
      threadTitle: thread?.title ?? null,
      desktop: isElectron,
    });
    // Projects change whenever any project does; most changes leave the title alone.
    if (document.title !== title) document.title = title;
  };
  // The open thread's own shell, since the shell lists skip threads hidden by a tag filter.
  let unsubscribeOpenThread = () => {};
  const watchOpenThread = () => {
    unsubscribeOpenThread();
    unsubscribeOpenThread =
      openThreadRef === null
        ? () => {}
        : appAtomRegistry.subscribe(
            environmentThreadShells.quietThreadShellAtom(openThreadRef),
            write,
          );
  };
  // Ignore draft keystrokes unless the thread or selected project changes.
  const updateOpenThread = () => {
    const { threadRef: next, draftProjectRef: nextProject } = readOpenContext(router);
    const nextOnGuestPage = readOnGuestPage();
    if (
      nextOnGuestPage === onGuestPage &&
      (nextProject && scopedProjectKey(nextProject)) ===
        (draftProjectRef && scopedProjectKey(draftProjectRef)) &&
      (next && scopedThreadKey(next)) === (openThreadRef && scopedThreadKey(openThreadRef))
    ) {
      return;
    }
    openThreadRef = next;
    draftProjectRef = nextProject;
    onGuestPage = nextOnGuestPage;
    watchOpenThread();
    write();
  };
  watchOpenThread();
  appAtomRegistry.subscribe(primaryServerConfigAtom, write, { immediate: true });
  appAtomRegistry.subscribe(environmentProjects.projectsAtom, write);
  router.subscribe("onResolved", updateOpenThread);
  useComposerDraftStore.subscribe(updateOpenThread);
}
