import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const content = sqliteTable("content", {
  id: text("id").primaryKey(), type: text("type").notNull(), slug: text("slug").notNull(),
  title: text("title").notNull(), summary: text("summary").notNull().default(""), body: text("body").notNull().default(""),
  status: text("status").notNull().default("draft"), category: text("category").notNull().default(""), region: text("region").notNull().default(""),
  meta: text("meta").notNull().default("{}"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("content_type_slug").on(t.type,t.slug), index("content_public").on(t.type,t.status)]);
export const settings = sqliteTable("settings", {key:text("key").primaryKey(),value:text("value").notNull(),updatedAt:text("updated_at").notNull(),actor:text("actor").notNull()});
export const state = sqliteTable("app_state", {key:text("key").primaryKey(),value:text("value").notNull()});
export const applications = sqliteTable("applications", {
  id:text("id").primaryKey(),reference:text("reference").notNull().unique(),type:text("type").notNull(),title:text("title").notNull(),
  organization:text("organization").notNull(),inn:text("inn").notNull().default(""),name:text("name").notNull(),email:text("email").notNull(),
  phone:text("phone").notNull().default(""),region:text("region").notNull(),direction:text("direction").notNull(),description:text("description").notNull(),
  status:text("status").notNull().default("new"),notes:text("notes").notNull().default(""),
  consentVersion:text("consent_version").notNull(),consentAt:text("consent_at").notNull(),
  idempotencyKey:text("idempotency_key").notNull().unique(),fingerprint:text("fingerprint").notNull(),
  createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[index("applications_status").on(t.status),index("applications_fingerprint").on(t.fingerprint,t.createdAt)]);
export const audit = sqliteTable("audit",{id:text("id").primaryKey(),actor:text("actor").notNull(),action:text("action").notNull(),entity:text("entity").notNull(),entityId:text("entity_id").notNull(),createdAt:text("created_at").notNull()});
export const files = sqliteTable("files",{key:text("key").primaryKey(),name:text("name").notNull(),mime:text("mime").notNull(),size:integer("size").notNull(),actor:text("actor").notNull(),createdAt:text("created_at").notNull()});
export const redirects = sqliteTable("redirects",{id:text("id").primaryKey(),type:text("type").notNull(),oldSlug:text("old_slug").notNull(),contentId:text("content_id").notNull()},t=>[uniqueIndex("redirect_type_slug").on(t.type,t.oldSlug)]);
export const rateLimits = sqliteTable("rate_limits",{key:text("key").primaryKey(),count:integer("count").notNull(),expiresAt:integer("expires_at").notNull()});
