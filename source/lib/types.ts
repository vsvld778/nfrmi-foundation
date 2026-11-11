export type ContentType = 'program' | 'project' | 'insight' | 'region' | 'document';
export type ContentStatus = 'draft' | 'published' | 'archived';
export interface ContentItem { id: string; type: ContentType; slug: string; title: string; summary: string; body: string; status: ContentStatus; category: string; region: string; meta: Record<string,string>; createdAt: string; updatedAt: string; }
export type Settings = Record<string,string>;
export interface Application { id: string; reference: string; type: string; title: string; organization: string; inn: string; name: string; email: string; phone: string; region: string; direction: string; description: string; status: string; notes: string; createdAt: string; updatedAt: string; }
