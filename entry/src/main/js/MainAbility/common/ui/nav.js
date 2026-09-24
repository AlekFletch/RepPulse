/**
 * Page helpers every page needs, with no dependencies (the workout page imports only these; the
 * rest of ui/page.js stays out of its bundle). Lite has only router.replace (no page stack) and every
 * page is its own bundle, so pages share nothing in memory: data travels in router params and storage.
 */

/** Page data is re-rendered on every assignment, so assign only real changes. */
export function setIfChanged(vm, key, value) {
  if (vm[key] !== value) {
    vm[key] = value;
  }
}

/**
 * Crown (rotation) focus for a scrollable list. It must be released before leaving the page:
 * a focused list removed by router.replace crashes the engine on the next crown turn or tap
 * (found and fixed in the BreathTrainer app on the same watch).
 */
export function focusRotation(list, focus) {
  try {
    list.rotation({ focus: focus });
  } catch (e) {
    // no crown or older runtime: touch scrolling still works
  }
}

/** Leaves the page: releases the crown focus of `list` (if any), then replaces the page. */
export function go(router, list, page, params) {
  if (list) {
    focusRotation(list, false);
  }
  const options = { uri: 'pages/' + page + '/' + page };
  if (params) {
    options.params = params;
  }
  router.replace(options);
}
