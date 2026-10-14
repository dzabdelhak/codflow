import { desc, eq } from "drizzle-orm";
import { channelDesigns, channelDesignVersions, stores } from "../db/schema";
import type { AppDb } from "../db/client";
import { first } from "../db/client";
import { manifestFor, type TemplateManifest } from "../channels/manifests";
import {
  brandFromStore,
  defaultDesign,
  storefrontBrand,
  validateDesign,
  type DesignDocument,
  type DesignError,
} from "../channels/design";

export interface PublishedDesign {
  version: number;
  document: DesignDocument;
  publishedAt: string;
  publishedBy: string | null;
}

export interface DesignEditorState {
  manifest: TemplateManifest;
  current: DesignDocument;
  draft: { document: DesignDocument; baseVersion: number | null; updatedAt: string; updatedBy: string | null } | null;
  published: PublishedDesign | null;
  versions: Array<{ version: number; publishedAt: string; publishedBy: string | null }>;
}

async function storeTemplate(db: AppDb, storeId: string) {
  const store = await db
    .select({
      themeId: stores.themeId,
      channelType: stores.channelType,
      logoUrl: stores.logoUrl,
      primaryColor: stores.primaryColor,
      accentColor: stores.accentColor,
      bgColor: stores.bgColor,
      fontFamily: stores.fontFamily,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .then(first);
  if (!store) return null;
  const manifest = manifestFor(store.themeId, store.channelType);
  return { manifest, fallback: defaultDesign(manifest, brandFromStore(store, manifest)) };
}

async function latestPublished(db: AppDb): Promise<PublishedDesign | null> {
  const row = await db
    .select()
    .from(channelDesignVersions)
    .orderBy(desc(channelDesignVersions.version))
    .limit(1)
    .then(first);
  return row
    ? { version: row.version, document: row.document as DesignDocument, publishedAt: row.publishedAt, publishedBy: row.publishedBy }
    : null;
}

export async function getDesignEditorState(db: AppDb, storeId: string): Promise<DesignEditorState | null> {
  const template = await storeTemplate(db, storeId);
  if (!template) return null;
  const [row, published, versions] = await Promise.all([
    db.select().from(channelDesigns).then(first),
    latestPublished(db),
    db
      .select({ version: channelDesignVersions.version, publishedAt: channelDesignVersions.publishedAt, publishedBy: channelDesignVersions.publishedBy })
      .from(channelDesignVersions)
      .orderBy(desc(channelDesignVersions.version)),
  ]);
  const draft = row?.draft
    ? { document: row.draft as DesignDocument, baseVersion: row.draftBaseVersion, updatedAt: row.updatedAt, updatedBy: row.updatedBy }
    : null;
  return {
    manifest: template.manifest,
    current: draft?.document ?? published?.document ?? template.fallback,
    draft,
    published,
    versions,
  };
}

export type DesignWriteResult = { ok: true } | { ok: false; reason: "not_found" } | { ok: false; reason: "invalid"; errors: DesignError[] };

async function writeDraft(db: AppDb, document: DesignDocument, baseVersion: number | null, actor: string | null) {
  const now = new Date().toISOString();
  await db
    .insert(channelDesigns)
    .values({ draft: document, draftBaseVersion: baseVersion, updatedAt: now, updatedBy: actor })
    .onConflictDoUpdate({
      target: channelDesigns.storeId,
      set: { draft: document, draftBaseVersion: baseVersion, updatedAt: now, updatedBy: actor },
    });
}

export async function saveDesignDraft(db: AppDb, storeId: string, input: unknown, actor: string | null): Promise<DesignWriteResult> {
  const template = await storeTemplate(db, storeId);
  if (!template) return { ok: false, reason: "not_found" };
  const result = validateDesign(input, template.manifest);
  if (!result.ok) return { ok: false, reason: "invalid", errors: result.errors };
  const published = await latestPublished(db);
  await writeDraft(db, result.document, published?.version ?? null, actor);
  return { ok: true };
}

export async function discardDesignDraft(db: AppDb): Promise<void> {
  await db.update(channelDesigns).set({ draft: null, draftBaseVersion: null, updatedAt: new Date().toISOString() });
}

export type RestoreResult = DesignWriteResult | { ok: false; reason: "unknown_version" };

export async function restoreDesignVersion(db: AppDb, storeId: string, version: number, actor: string | null): Promise<RestoreResult> {
  const template = await storeTemplate(db, storeId);
  if (!template) return { ok: false, reason: "not_found" };
  const row = await db
    .select({ document: channelDesignVersions.document })
    .from(channelDesignVersions)
    .where(eq(channelDesignVersions.version, version))
    .then(first);
  if (!row) return { ok: false, reason: "unknown_version" };
  const result = validateDesign(row.document, template.manifest);
  if (!result.ok) return { ok: false, reason: "invalid", errors: result.errors };
  const published = await latestPublished(db);
  await writeDraft(db, result.document, published?.version ?? null, actor);
  return { ok: true };
}

export type PublishResult =
  | { ok: true; version: number }
  | { ok: false; reason: "not_found" | "nothing_to_publish" }
  | { ok: false; reason: "invalid"; errors: DesignError[] };

export async function publishDesign(db: AppDb, storeId: string, actor: string | null): Promise<PublishResult> {
  const template = await storeTemplate(db, storeId);
  if (!template) return { ok: false, reason: "not_found" };
  const now = new Date().toISOString();
  await db.insert(channelDesigns).values({ updatedAt: now }).onConflictDoNothing();
  const row = await db.select().from(channelDesigns).for("update").then(first);
  const published = await latestPublished(db);
  if (!row?.draft && published) return { ok: false, reason: "nothing_to_publish" };
  const result = validateDesign(row?.draft ?? template.fallback, template.manifest);
  if (!result.ok) return { ok: false, reason: "invalid", errors: result.errors };

  const version = (published?.version ?? 0) + 1;
  const brand = storefrontBrand(result.document.brand, template.manifest);
  await db.insert(channelDesignVersions).values({ version, document: result.document, publishedAt: now, publishedBy: actor });
  await db.update(channelDesigns).set({ draft: null, draftBaseVersion: null, updatedAt: now, updatedBy: actor });
  await db
    .update(stores)
    .set({
      logoUrl: brand.logoUrl,
      primaryColor: brand.primaryColor,
      accentColor: brand.accentColor,
      bgColor: brand.bgColor,
      fontFamily: brand.fontFamily,
      fontUrl: brand.fontUrl,
      updatedAt: now,
    })
    .where(eq(stores.id, storeId));
  return { ok: true, version };
}

export async function storefrontDesignSource(db: AppDb, preview: boolean): Promise<{ version: number; document: DesignDocument | null }> {
  const [published, draft] = await Promise.all([
    latestPublished(db),
    preview ? db.select({ draft: channelDesigns.draft }).from(channelDesigns).then(first) : Promise.resolve(undefined),
  ]);
  const draftDocument = (draft?.draft as DesignDocument | null | undefined) ?? null;
  return { version: published?.version ?? 0, document: draftDocument ?? published?.document ?? null };
}

