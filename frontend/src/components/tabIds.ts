/**
 * Element ids tying a <TabBar> to its panel.
 *
 * Split out of TabBar.tsx so that file exports only its component and keeps
 * fast refresh working; both the strip and the page rendering the panel need
 * to agree on these strings.
 */
export function tabId(idPrefix: string, id: string) {
  return `${idPrefix}-tab-${id}`
}

export function panelId(idPrefix: string, id: string) {
  return `${idPrefix}-panel-${id}`
}
