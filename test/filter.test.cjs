const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createFilter } = require("../src/comments/filter.js");
const { entity, view, thread, nextPage, batch, bodyItems, ids } = require("./fixtures.cjs");
const mention = { onTap: { innertubeCommand: { browseEndpoint: { browseId: "UC_MENTIONED_CHANNEL" } } } };
const external = url => ({ onTap: { innertubeCommand: { urlEndpoint: { url } } } });

test("cached blocked profile decisions remove modern rows and replies with ordinary text", () => {
  const badId = "UC_KNOWN_BLOCKED_AUTHOR";
  const parent = thread("parent", [view("bad-reply"), view("good-reply")]);
  const entries = [entity("parent", "Good parent"), entity("bad-top", "Ordinary text"),
    entity("bad-reply", "An ordinary reply"), entity("good-reply", "Allowed reply")];
  entries[1].payload.commentEntityPayload.author.channelId = badId;
  entries[2].payload.commentEntityPayload.author.channelId = badId;
  const payload = batch(entries, [parent, thread("bad-top")]);
  const filter = createFilter({ getAuthorDecision: id => id === badId ? { blocked: true } : undefined });
  filter.filterPayload(payload);
  assert.deepEqual(ids(payload), ["parent"]);
  assert.equal(parent.commentThreadRenderer.replies.commentRepliesRenderer.contents.length, 1);
  assert.equal(parent.commentThreadRenderer.replies.commentRepliesRenderer.contents[0].commentViewModel.commentViewModel.commentId, "good-reply");
  assert.deepEqual(payload.frameworkUpdates.entityBatchUpdate.mutations.map(m => m.payload.commentEntityPayload.properties.commentId), ["parent", "good-reply"]);
  assert.equal(filter.getStats().blockedAuthors, 2);
  assert.equal(filter.getStats().screened, 4);
});

test("cached legacy profile decisions do not reject every author profile link", () => {
  const comment = (id, channel) => ({ commentRenderer: { commentId: id,
    contentText: { simpleText: "Ordinary comment" },
    authorEndpoint: { browseEndpoint: { browseId: channel } } } });
  const payload = { continuationContents: { itemSectionContinuation: { contents: [
    comment("bad", "UC_BLOCKED"), comment("allowed", "UC_ALLOWED"), nextPage(),
  ] } } };
  const filter = createFilter({ getAuthorDecision: id => id === "UC_BLOCKED" ? { blocked: true } : undefined });
  filter.filterPayload(payload);
  assert.equal(payload.continuationContents.itemSectionContinuation.contents[0].commentRenderer.commentId, "allowed");
  assert.equal(payload.continuationContents.itemSectionContinuation.contents.length, 2);
  assert.equal(filter.getStats().blockedAuthors, 1);
});

test("remove whole modern rows and their body entities before rendering; preserve author links, headers, and pagination", () => {
  const payload = batch([
    entity("allowed", "A normal comment"),
    entity("mention", "Thanks @someone", [mention]),
    entity("shortener", "Click here", [external("https://tinyurl.com/example")]),
    entity("wrapped", "Click here", [external("https://www.youtube.com/redirect?q=https%3A%2F%2Ftinyurl.com%2Fexample")]),
  ]);
  const context = payload.responseContext;
  const header = payload.onResponseReceivedEndpoints[0];
  const token = bodyItems(payload).at(-1);
  const filter = createFilter();
  assert.equal(filter.filterPayload(payload), payload);
  assert.deepEqual(ids(payload), ["allowed"]);
  assert.equal(payload.frameworkUpdates.entityBatchUpdate.mutations.length, 1);
  assert.equal(bodyItems(payload).at(-1), token);
  assert.equal(payload.responseContext, context);
  assert.equal(payload.onResponseReceivedEndpoints[0], header);
  assert.equal(filter.getStats().removed, 3);
});

test("bad replies do not hide their allowed parent or siblings", () => {
  const parent = thread("parent", [view("bad-reply"), view("good-reply"), nextPage()]);
  const payload = batch([
    entity("parent", "Good parent"), entity("bad-reply", "tinyurl.com/x"), entity("good-reply", "Good reply"),
  ], [parent]);
  createFilter().filterPayload(payload);
  assert.deepEqual(ids(payload), ["parent"]);
  const replies = parent.commentThreadRenderer.replies.commentRepliesRenderer.contents;
  assert.equal(replies.length, 2);
  assert.equal(replies[0].commentViewModel.commentViewModel.commentId, "good-reply");
  assert.ok(replies[1].continuationItemRenderer);
});

test("standalone reply batches are screened and retain their continuation command", () => {
  const payload = batch([entity("bad", "Thanks @channel", [mention]), entity("good", "Thanks!")], [view("bad"), view("good")]);
  payload.onResponseReceivedEndpoints[1].appendContinuationItemsAction = payload.onResponseReceivedEndpoints[1].reloadContinuationItemsCommand;
  delete payload.onResponseReceivedEndpoints[1].reloadContinuationItemsCommand;
  createFilter().filterPayload(payload);
  const items = payload.onResponseReceivedEndpoints[1].appendContinuationItemsAction.continuationItems;
  assert.equal(items[0].commentViewModel.commentViewModel.commentId, "good");
  assert.equal(items.length, 2);
});

test("exact hostname matching, redirect decoding, and cache bounds", () => {
  const filter = createFilter({ urlCacheSize: 3 });
  for (const url of ["https://tinyurl.com/x", "https://www.tinyurl.com/x", "https://tinyurl.com./x"]) assert.equal(filter.classifyUrl(url), "blockedDomains");
  for (const url of ["https://tinyurl.com.example.org/x", "https://nottinyurl.com/x", "https://example.org/?url=tinyurl.com", "https://example.org/tinyurl.com", "not a url"]) assert.equal(filter.classifyUrl(url), null);
  assert.equal(filter.classifyUrl("https://www.youtube.com/redirect?q=https%3A%2F%2Fwww.youtube.com%2F%40channel"), "channelLinks");
  assert.ok(filter.getStats().cachedUrls <= 3);
});

test("URL text is checked by destination; ordinary emails, @words, and domain substrings pass", () => {
  const passing = ["Email a@tinyurl.com", "Hello @word", "nottinyurl.com/x", "tinyurl.com.example.org/x", "https://example.org/?url=tinyurl.com", "https://example.org/tinyurl.com", "A URL: https://example.org/?next=https://tinyurl.com/x"];
  const failing = ["Visit tinyurl.com/x", "Visit WWW.TINYURL.COM/x", "Visit https://tinyurl.com/x", "Visit https://www.youtube.com/@somebody", "Visit https://youtube.com/channel/UC_somebody"];
  const payload = batch([...passing.map((text, i) => entity(`pass-${i}`, text)), ...failing.map((text, i) => entity(`fail-${i}`, text))]);
  createFilter().filterPayload(payload);
  assert.deepEqual(ids(payload), passing.map((_, i) => `pass-${i}`));
});

test("settings independently disable channel and domain rules", () => {
  const payload = batch([entity("mention", "@channel", [mention]), entity("url", "https://tinyurl.com/x")]);
  createFilter({ blockedDomains: [], blockChannelLinks: false }).filterPayload(payload);
  assert.deepEqual(ids(payload), ["mention", "url"]);
});

test("legacy inline comment renderers and embedded replies are supported", () => {
  const good = { commentRenderer: { commentId: "good", contentText: { runs: [{ text: "Good comment" }] }, authorEndpoint: { browseEndpoint: { browseId: "UC_AUTHOR" } } } };
  const bad = { commentRenderer: { commentId: "bad", contentText: { runs: [{ text: "@channel", navigationEndpoint: { browseEndpoint: { browseId: "UC_CHANNEL" } } }] } } };
  const payload = { continuationContents: { itemSectionContinuation: { contents: [
    { commentThreadRenderer: { comment: good, replies: { commentRepliesRenderer: { contents: [bad, nextPage()] } } } }, bad, nextPage(),
  ] } } };
  createFilter().filterPayload(payload);
  const items = payload.continuationContents.itemSectionContinuation.contents;
  assert.equal(items.length, 2);
  assert.equal(items[0].commentThreadRenderer.replies.commentRepliesRenderer.contents.length, 1);
});

test("initial watch bootstrap sections are filtered; unrelated sections are untouched", () => {
  const bad = { commentRenderer: { contentText: { simpleText: "https://tinyurl.com/x" } } };
  const unrelated = { itemSectionRenderer: { targetId: "recommendations", contents: [bad] } };
  const payload = { contents: { twoColumnWatchNextResults: { results: { results: { contents: [
    { itemSectionRenderer: { targetId: "comments-section", contents: [bad, nextPage()] } }, unrelated,
  ] } } } } };
  createFilter().filterPayload(payload);
  const items = payload.contents.twoColumnWatchNextResults.results.results.contents;
  assert.equal(items[0].itemSectionRenderer.contents.length, 1);
  assert.equal(items[1], unrelated);
  assert.equal(unrelated.itemSectionRenderer.contents.length, 1);
});

test("an entirely rejected batch still allows YouTube to request the next page", () => {
  const payload = batch([entity("one", "tinyurl.com/x"), entity("two", "tinyurl.com/y")]);
  createFilter().filterPayload(payload);
  assert.deepEqual(bodyItems(payload), [nextPage()]);
});

test("missing text entities preserve unknown rows and expose a diagnostic", () => {
  const payload = batch([], [thread("unknown")]);
  const filter = createFilter();
  filter.filterPayload(payload);
  assert.deepEqual(ids(payload), ["unknown"]);
  assert.equal(filter.getStats().unresolvedViews, 1);
});

test("unrelated payloads preserve object identity and repeated reads do not screen twice", () => {
  const filter = createFilter();
  const player = { playabilityStatus: { status: "OK" }, streamingData: { formats: [{ url: "https://tinyurl.com/not-a-comment" }] } };
  assert.equal(filter.filterPayload(player), player);
  assert.equal(filter.getStats().screened, 0);
  const payload = batch([entity("good", "Good comment")]);
  filter.filterPayload(payload);
  filter.filterPayload(payload);
  assert.equal(filter.getStats().screened, 1);
});
