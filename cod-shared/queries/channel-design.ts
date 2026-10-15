import { asc, desc, eq, sql } from "drizzle-orm";
import { channelDesigns, channelDesignVersions, storeDomains, stores } from "../db/schema";
import type { AppDb } from "../db/client";
import { first } from "../db/client";
import { manifestFor, type TemplateManifest } from "../channels/manifests";
import { isTemplateFor, templateById, templateDesign } from "../channels/templates";
import {
  brandFromStore,
  storefrontBrand,
  validateDesign,
  type DesignBrand,
  type DesignDocument,
  type DesignError,
  type DesignSection,
} from "../channels/design";

export interface PublishedDesign {
  version: number;
  document: DesignDocument;
  publishedAt: string;
  publishedBy: string | null;
}

export interface DesignEditorState {
  templateId: string;
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
  return {
    templateId: store.themeId,
    channelType: store.channelType,
    logoUrl: store.logoUrl,
    manifest,
    fallback: templateDesign(store.themeId, manifest, brandFromStore(store, manifest)),
  };
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
    templateId: template.templateId,
    manifest: template.manifest,
    current: draft?.document ?? { ...(published?.document ?? template.fallback), brand: template.fallback.brand },
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

export type TemplateChangeResult = { ok: true } | { ok: false; reason: "not_found" | "unknown_template" };

export async function changeChannelTemplate(db: AppDb, storeId: string, templateId: string, actor: string | null): Promise<TemplateChangeResult> {
  const template = await storeTemplate(db, storeId);
  if (!template) return { ok: false, reason: "not_found" };
  if (!isTemplateFor(template.channelType, templateId)) return { ok: false, reason: "unknown_template" };
  const manifest = manifestFor(templateId, template.channelType);
  const brand: DesignBrand = { logoUrl: template.logoUrl, ...templateById(templateId)!.preset.brand };
  await db.update(stores).set({ themeId: templateId, updatedAt: new Date().toISOString() }).where(eq(stores.id, storeId));
  const published = await latestPublished(db);
  await writeDraft(db, templateDesign(templateId, manifest, brand), published?.version ?? null, actor);
  return { ok: true };
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
      ...(brand.fontFamily ? { fontFamily: brand.fontFamily, fontUrl: brand.fontUrl } : {}),
      updatedAt: now,
    })
    .where(eq(stores.id, storeId));
  return { ok: true, version };
}

export interface StorefrontDesignSource {
  version: number;
  sections: DesignSection[] | null;
  brand: DesignBrand | null;
}

export async function storefrontDesignSource(db: AppDb, preview: boolean): Promise<StorefrontDesignSource> {
  const [published, draft] = await Promise.all([
    db
      .select({
        version: channelDesignVersions.version,
        sections: sql<DesignSection[]>`coalesce((select jsonb_agg(s) from jsonb_array_elements(${channelDesignVersions.document}->'sections') s where (s->>'enabled')::boolean), '[]'::jsonb)`,
      })
      .from(channelDesignVersions)
      .orderBy(desc(channelDesignVersions.version))
      .limit(1)
      .then(first),
    preview ? db.select({ draft: channelDesigns.draft }).from(channelDesigns).then(first) : Promise.resolve(undefined),
  ]);
  const draftDocument = (draft?.draft as DesignDocument | null | undefined) ?? null;
  return {
    version: published?.version ?? 0,
    sections: draftDocument?.sections ?? published?.sections ?? null,
    brand: draftDocument?.brand ?? null,
  };
}

export async function channelHostname(db: AppDb, storeId: string): Promise<string | null> {
  const row = await db
    .select({ hostname: storeDomains.hostname })
    .from(storeDomains)
    .where(eq(storeDomains.storeId, storeId))
    .orderBy(sql`${storeDomains.kind} = 'subdomain' desc`, asc(storeDomains.createdAt))
    .limit(1)
    .then(first);
  return row?.hostname ?? null;
}

