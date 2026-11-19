"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bold,
  Eye,
  FileEdit,
  Heading2,
  Heading3,
  HelpCircle,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Mail,
  MapPin,
  Phone,
  Quote,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Field, Input, Textarea } from "@shared/ui/field";
import { EmptyState, ErrorState, FilterTabs, Skeleton } from "@shared/ui/misc";
import { editorialApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import { useToast } from "@shared/ui/toast";
import type { ContactInfo, EditorialPage } from "@shared/types";

const PAGES = [
  { slug: "about", label: "About Us", description: "Company overview, healthcare mission, and background." },
  { slug: "terms", label: "Terms of Service", description: "Legal terms for customer booking, visits, and caregiver conduct." },
  { slug: "privacy", label: "Privacy Policy", description: "Data security, encryption, and medical information privacy." },
] as const;

export default function EditorialAdminPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"pages" | "contact">("pages");
  const [selectedSlug, setSelectedSlug] = useState<string>("about");

  // Page Editor State
  const [pageTitle, setPageTitle] = useState("");
  const [pageContent, setPageContent] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Contact Info State
  const [contact, setContact] = useState<Partial<ContactInfo>>({});

  // Query Page Content
  const pageQuery = useQuery({
    queryKey: [...keys.editorial, "page", selectedSlug],
    queryFn: () => editorialApi.getPage(selectedSlug),
    enabled: tab === "pages",
  });

  useEffect(() => {
    if (pageQuery.data) {
      setPageTitle(pageQuery.data.title);
      setPageContent(pageQuery.data.content);
    }
  }, [pageQuery.data, selectedSlug]);

  // Query Contact Info
  const contactQuery = useQuery({
    queryKey: [...keys.editorial, "contact"],
    queryFn: () => editorialApi.getContactInfo(),
    enabled: tab === "contact",
  });

  useEffect(() => {
    if (contactQuery.data) {
      setContact(contactQuery.data);
    }
  }, [contactQuery.data]);

  // Save Page Action
  const savePage = useAction(
    () => editorialApi.updatePage(selectedSlug, { title: pageTitle.trim(), content: pageContent.trim() }),
    {
      invalidate: [keys.editorial],
      success: `"${pageTitle || selectedSlug}" published successfully`,
    },
  );

  // Save Contact Info Action
  const saveContact = useAction(() => editorialApi.updateContactInfo(contact), {
    invalidate: [keys.editorial],
    success: "Platform contact information updated successfully",
  });

  // Helper to insert markdown/formatting tags
  const insertFormatting = (prefix: string, suffix: string = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selection = text.substring(start, end) || "text";
    const replacement = `${prefix}${selection}${suffix}`;
    const nextValue = text.substring(0, start) + replacement + text.substring(end);
    setPageContent(nextValue);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selection.length);
    }, 0);
  };

  return (
    <>
      <PageHeader
        title="Editorial & Content Management"
        description="Manage the live copy of public pages (About, Terms, Privacy) and update the site's official contact information."
      />

      <div className="mb-6">
        <FilterTabs
          value={tab}
          onChange={(v) => setTab(v as "pages" | "contact")}
          options={[
            { value: "pages", label: "Editorial Pages" },
            { value: "contact", label: "Contact Information" },
          ]}
        />
      </div>

      {tab === "pages" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Page Picker Sidebar */}
          <div className="space-y-2 lg:col-span-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400 mb-3">Public Pages</h3>
            {PAGES.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => setSelectedSlug(p.slug)}
                className={`w-full text-start rounded-xl p-3.5 transition-all ${
                  selectedSlug === p.slug
                    ? "bg-brand-50 border border-brand-200 text-brand-950 shadow-xs"
                    : "bg-white border border-ink-100 text-ink-700 hover:bg-ink-50 hover:border-ink-200"
                }`}
              >
                <p className="font-bold text-sm text-ink-900">{p.label}</p>
                <p className="text-xs text-ink-500 line-clamp-2 mt-0.5">{p.description}</p>
              </button>
            ))}
          </div>

          {/* Editor Area */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader
                title={`Editing: ${PAGES.find((p) => p.slug === selectedSlug)?.label ?? selectedSlug}`}
                description="Use the rich formatting toolbar to structure headings, paragraphs, and guidelines."
                action={
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPreviewMode(!previewMode)}
                    >
                      <Eye className="size-4" /> {previewMode ? "Editor Mode" : "Live Preview"}
                    </Button>
                    <Button
                      size="sm"
                      loading={savePage.isPending}
                      onClick={() => savePage.mutate(undefined)}
                      disabled={!pageTitle.trim() || !pageContent.trim()}
                    >
                      <Save className="size-4" /> Save Page
                    </Button>
                  </div>
                }
              />
              <CardBody className="space-y-4">
                {pageQuery.isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 rounded-lg" />
                    <Skeleton className="h-64 rounded-lg" />
                  </div>
                ) : (
                  <>
                    <Field label="Page Title" required>
                      {(id) => (
                        <Input
                          id={id}
                          value={pageTitle}
                          onChange={(e) => setPageTitle(e.target.value)}
                          placeholder="e.g. Terms of Service"
                        />
                      )}
                    </Field>

                    {/* Toolbar */}
                    {!previewMode && (
                      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-ink-200 bg-ink-50 p-1.5">
                        <button
                          type="button"
                          onClick={() => insertFormatting("**", "**")}
                          title="Bold"
                          className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-200 hover:text-ink-900"
                        >
                          <Bold className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertFormatting("*", "*")}
                          title="Italic"
                          className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-200 hover:text-ink-900"
                        >
                          <Italic className="size-4" />
                        </button>
                        <span className="mx-1 h-4 w-px bg-ink-200" />
                        <button
                          type="button"
                          onClick={() => insertFormatting("## ")}
                          title="Heading 2"
                          className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-200 hover:text-ink-900"
                        >
                          <Heading2 className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertFormatting("### ")}
                          title="Heading 3"
                          className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-200 hover:text-ink-900"
                        >
                          <Heading3 className="size-4" />
                        </button>
                        <span className="mx-1 h-4 w-px bg-ink-200" />
                        <button
                          type="button"
                          onClick={() => insertFormatting("- ")}
                          title="Bullet list"
                          className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-200 hover:text-ink-900"
                        >
                          <List className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertFormatting("1. ")}
                          title="Numbered list"
                          className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-200 hover:text-ink-900"
                        >
                          <ListOrdered className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertFormatting("> ")}
                          title="Quote"
                          className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-200 hover:text-ink-900"
                        >
                          <Quote className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertFormatting("[Link title](", ")")}
                          title="Insert link"
                          className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-200 hover:text-ink-900"
                        >
                          <LinkIcon className="size-4" />
                        </button>
                      </div>
                    )}

                    {previewMode ? (
                      <div className="min-h-[360px] rounded-xl border border-ink-200 bg-ink-25 p-6 prose prose-ink max-w-none">
                        <h1 className="text-2xl font-bold text-ink-900">{pageTitle}</h1>
                        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
                          {pageContent}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                          Content (Markdown & HTML supported)
                        </label>
                        <textarea
                          ref={textareaRef}
                          value={pageContent}
                          rows={14}
                          onChange={(e) => setPageContent(e.target.value)}
                          className="w-full rounded-xl border border-ink-200 bg-white p-4 font-mono text-sm leading-relaxed text-ink-900 shadow-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                          placeholder="Write the page content here..."
                        />
                      </div>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === "contact" && (
        <Card className="max-w-3xl">
          <CardHeader
            title="Official Contact & Support Details"
            description="These details populate the public /contact page, website footer, and support inquiries across the platform."
            action={
              <Button
                size="sm"
                loading={saveContact.isPending}
                onClick={() => saveContact.mutate(undefined)}
              >
                <Save className="size-4" /> Save Contact Info
              </Button>
            }
          />
          <CardBody className="space-y-5">
            {contactQuery.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ) : (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveContact.mutate(undefined);
                }}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Customer Support Email">
                    {(id) => (
                      <Input
                        id={id}
                        type="email"
                        value={contact.email ?? ""}
                        onChange={(e) => setContact({ ...contact, email: e.target.value })}
                        placeholder="info@caresaath.com"
                      />
                    )}
                  </Field>

                  <Field label="Caregiver Onboarding Email">
                    {(id) => (
                      <Input
                        id={id}
                        type="email"
                        value={contact.caregiverEmail ?? ""}
                        onChange={(e) => setContact({ ...contact, caregiverEmail: e.target.value })}
                        placeholder="caregivers@caresaath.pk"
                      />
                    )}
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Press & Business Inquiries Email">
                    {(id) => (
                      <Input
                        id={id}
                        type="email"
                        value={contact.pressEmail ?? ""}
                        onChange={(e) => setContact({ ...contact, pressEmail: e.target.value })}
                        placeholder="hello@caresaath.pk"
                      />
                    )}
                  </Field>

                  <Field label="Helpline / Phone Number">
                    {(id) => (
                      <Input
                        id={id}
                        value={contact.phone ?? ""}
                        onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                        placeholder="+92 42 111 227 372"
                      />
                    )}
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="WhatsApp Support Number">
                    {(id) => (
                      <Input
                        id={id}
                        value={contact.whatsapp ?? ""}
                        onChange={(e) => setContact({ ...contact, whatsapp: e.target.value })}
                        placeholder="+92 300 2273728"
                      />
                    )}
                  </Field>

                  <Field label="Operating Hours">
                    {(id) => (
                      <Input
                        id={id}
                        value={contact.hours ?? ""}
                        onChange={(e) => setContact({ ...contact, hours: e.target.value })}
                        placeholder="24/7 Helpline & Dispatch"
                      />
                    )}
                  </Field>
                </div>

                <Field label="Head Office Address">
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={2}
                      value={contact.address ?? ""}
                      onChange={(e) => setContact({ ...contact, address: e.target.value })}
                      placeholder="Gulberg III, Lahore, Pakistan"
                    />
                  )}
                </Field>

                <div className="flex justify-end pt-2">
                  <Button type="submit" loading={saveContact.isPending}>
                    <Save className="size-4" /> Save Contact Details
                  </Button>
                </div>
              </form>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}
