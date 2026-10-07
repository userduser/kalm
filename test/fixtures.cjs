function entity(id, content, commandRuns) {
  return { entityKey: `entity-${id}`, payload: { commentEntityPayload: {
    key: `body-${id}`, properties: { commentId: id, content: { content, ...(commandRuns ? { commandRuns } : {}) } },
    author: { channelId: "UC_AUTHOR_ALWAYS_LINKED", channelCommand: { browseEndpoint: { browseId: "UC_AUTHOR_ALWAYS_LINKED" } } },
  } } };
}
function view(id) {
  return { commentViewModel: { commentViewModel: { commentKey: `body-${id}`, commentId: id, toolbarStateKey: `toolbar-${id}` } } };
}
function thread(id, replies) {
  return { commentThreadRenderer: { ...view(id), ...(replies ? { replies: { commentRepliesRenderer: { contents: replies } } } : {}) } };
}
const nextPage = () => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "NEXT_PAGE", request: "CONTINUATION_REQUEST_TYPE_WATCH_NEXT" } } } });
function batch(entities, items = entities.map(item => thread(item.payload.commentEntityPayload.properties.commentId))) {
  return {
    responseContext: { serviceTrackingParams: [{ service: "UNCHANGED" }] },
    onResponseReceivedEndpoints: [
      { reloadContinuationItemsCommand: { targetId: "comments-section", slot: "RELOAD_CONTINUATION_SLOT_HEADER", continuationItems: [{ commentsHeaderRenderer: { countText: { simpleText: "100 comments" } } }] } },
      { reloadContinuationItemsCommand: { targetId: "comments-section", slot: "RELOAD_CONTINUATION_SLOT_BODY", continuationItems: [...items, nextPage()] } },
    ],
    frameworkUpdates: { entityBatchUpdate: { mutations: entities } },
  };
}
const bodyItems = payload => payload.onResponseReceivedEndpoints[1].reloadContinuationItemsCommand.continuationItems;
const ids = payload => bodyItems(payload).filter(item => item.commentThreadRenderer).map(item => item.commentThreadRenderer.commentViewModel.commentViewModel.commentId);
module.exports = { entity, view, thread, nextPage, batch, bodyItems, ids };
