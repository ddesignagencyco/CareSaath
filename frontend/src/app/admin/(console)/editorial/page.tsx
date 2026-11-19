"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bold,
  Code,
  CornerDownLeft,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Mail,
  MapPin,
  Minus,
  Phone,
  Quote,
  Redo,
  RemoveFormatting,
  Save,
  Strikethrough,
  Underline,
  Undo,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Field, Input, Textarea } from "@shared/ui/field";
import { FilterTabs, Skeleton } from "@shared/ui/misc";
import { editorialApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import type { ContactInfo } from "@shared/types";

const PAGES = [
  { slug: "about", label: "About Us", description: "Company background, healthcare verification mission, and safety promise." },
  { slug: "terms", label: "Terms of Service", description: "Legal terms for customer booking, visits, and caregiver conduct." },
  { slug: "privacy", label: "Privacy Policy", description: "Medical data security, encryption, and patient privacy standards." },
] as const;

export default function EditorialAdminPage() {
  const [tab, setTab] = useState<"pages" | "contact">("pages");
  const [selectedSlug, setSelectedSlug] = useState<string>("about");

  // Rich Text Editor State
  const editorRef = useRef<HTMLDivElement>(null);
  const [rawHtmlMode, setRawHtmlMode] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");

  // Contact Info State
  const [contact, setContact] = useState<Partial<ContactInfo>>({});

  // Query Page Content
  const pageQuery = useQuery({
    queryKey: [...keys.editorial, "page", selectedSlug],
    queryFn: () => editorialApi.getPage(selectedSlug),
    enabled: tab === "pages",
  });

  // Sync loaded page content to editor
  useEffect(() => {
    if (pageQuery.data) {
      const content = pageQuery.data.content || "";
      setHtmlContent(content);
      if (editorRef.current && !rawHtmlMode) {
        editorRef.current.innerHTML = content;
      }
    }
  }, [pageQuery.data, selectedSlug, rawHtmlMode]);

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
    () => {
      const finalContent = rawHtmlMode
        ? htmlContent
        : (editorRef.current?.innerHTML ?? htmlContent);
      return editorialApi.updatePage(selectedSlug, { content: finalContent });
    },
    {
      invalidate: [keys.editorial],
      success: `Page "${PAGES.find((p) => p.slug === selectedSlug)?.label ?? selectedSlug}" published successfully`,
    },
  );

  // Save Contact Info Action
  const saveContact = useAction(() => editorialApi.updateContactInfo(contact), {
    invalidate: [keys.editorial],
    success: "Platform contact information updated successfully",
  });

  // Execute formatting command on contentEditable
  const execCmd = (command: string, value: string | undefined = undefined) => {
    if (rawHtmlMode) return;
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setHtmlContent(editorRef.current.innerHTML);
    }
  };

  const handleLink = () => {
    if (rawHtmlMode) return;
    const url = prompt("Enter URL link (e.g. https://... or mailto:...):");
    if (url) {
      execCmd("createLink", url);
    }
  };

  const handleEditorInput = () => {
    if (editorRef.current) {
      setHtmlContent(editorRef.current.innerHTML);
    }
  };

  const toggleRawHtml = () => {
    if (rawHtmlMode) {
      // Switching back to visual editor: sync raw HTML into contentEditable
      setRawHtmlMode(false);
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = htmlContent;
        }
      }, 0);
    } else {
      // Switching to raw HTML view: capture current innerHTML
      if (editorRef.current) {
        setHtmlContent(editorRef.current.innerHTML);
      }
      setRawHtmlMode(true);
    }
  };

  const currentPage = PAGES.find((p) => p.slug === selectedSlug);

  return (
    <>
      <PageHeader
        title="Editorial & Content Management"
        description="Directly edit and format the live text of public website pages and platform contact details."
      />

      <div className="mb-6">
        <FilterTabs
          value={tab}
          onChange={(v) => setTab(v as "pages" | "contact")}
          options={[
            { value: "pages", label: "Public Pages Copy" },
            { value: "contact", label: "Official Contact Details" },
          ]}
        />
      </div>

      {tab === "pages" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Page Selector Sidebar */}
          <div className="space-y-2 lg:col-span-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2">Select Page</h3>
            {PAGES.map((p) => {
              const active = selectedSlug === p.slug;
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => {
                    setSelectedSlug(p.slug);
                    setRawHtmlMode(false);
                  }}
                  className={`w-full text-start rounded-xl p-3.5 transition-all ${
                    active
                      ? "bg-brand-50 border border-brand-200 text-brand-950 shadow-xs"
                      : "bg-white border border-ink-100 text-ink-700 hover:bg-ink-50 hover:border-ink-200"
                  }`}
                >
                  <p className="font-bold text-sm text-ink-900">{p.label}</p>
                  <p className="text-xs text-ink-500 mt-1 line-clamp-2">{p.description}</p>
                </button>
              );
            })}
          </div>

          {/* Rich Text Editor Main Card */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader
                title={`Editing: ${currentPage?.label ?? selectedSlug}`}
                description="Use the rich formatting toolbar below to edit headings, bold text, bullet points, and paragraphs."
                action={
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={toggleRawHtml}
                      title="Toggle raw HTML source view"
                    >
                      <Code className="size-4" /> {rawHtmlMode ? "Visual Editor" : "HTML Source"}
                    </Button>
                    <Button
                      size="sm"
                      loading={savePage.isPending}
                      onClick={() => savePage.mutate(undefined)}
                    >
                      <Save className="size-4" /> Save Page Content
                    </Button>
                  </div>
                }
              />

              <CardBody className="p-0">
                {pageQuery.isLoading ? (
                  <div className="p-6 space-y-4">
                    <Skeleton className="h-10 rounded-lg" />
                    <Skeleton className="h-64 rounded-lg" />
                  </div>
                ) : (
                  <div>
                    {/* Rich Text Formatting Toolbar */}
                    {!rawHtmlMode && (
                      <div className="flex flex-wrap items-center gap-1 border-b border-ink-100 bg-ink-25/80 px-3 py-2">
                        {/* Heading / Block Dropdown */}
                        <div className="flex items-center gap-0.5 border-r border-ink-200 pr-2 mr-1">
                          <button
                            type="button"
                            onClick={() => execCmd("formatBlock", "<p>")}
                            title="Normal Paragraph"
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-100"
                          >
                            Normal
                          </button>
                          <button
                            type="button"
                            onClick={() => execCmd("formatBlock", "<h2>")}
                            title="Heading 2"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Heading2 className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => execCmd("formatBlock", "<h3>")}
                            title="Heading 3"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Heading3 className="size-4" />
                          </button>
                        </div>

                        {/* Inline Formatting */}
                        <div className="flex items-center gap-0.5 border-r border-ink-200 pr-2 mr-1">
                          <button
                            type="button"
                            onClick={() => execCmd("bold")}
                            title="Bold (Ctrl+B)"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Bold className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => execCmd("italic")}
                            title="Italic (Ctrl+I)"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Italic className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => execCmd("underline")}
                            title="Underline (Ctrl+U)"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Underline className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => execCmd("strikeThrough")}
                            title="Strikethrough"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Strikethrough className="size-4" />
                          </button>
                        </div>

                        {/* Lists */}
                        <div className="flex items-center gap-0.5 border-r border-ink-200 pr-2 mr-1">
                          <button
                            type="button"
                            onClick={() => execCmd("insertUnorderedList")}
                            title="Bullet List"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <List className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => execCmd("insertOrderedList")}
                            title="Numbered List"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <ListOrdered className="size-4" />
                          </button>
                        </div>

                        {/* Blockquote & Divider & Link */}
                        <div className="flex items-center gap-0.5 border-r border-ink-200 pr-2 mr-1">
                          <button
                            type="button"
                            onClick={() => execCmd("formatBlock", "<blockquote>")}
                            title="Quote"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Quote className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => execCmd("insertHorizontalRule")}
                            title="Horizontal Divider"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Minus className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleLink}
                            title="Insert Link"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <LinkIcon className="size-4" />
                          </button>
                        </div>

                        {/* Clear & History */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => execCmd("removeFormat")}
                            title="Clear Formatting"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <RemoveFormatting className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => execCmd("undo")}
                            title="Undo (Ctrl+Z)"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Undo className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => execCmd("redo")}
                            title="Redo (Ctrl+Y)"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Redo className="size-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Editor Surface */}
                    {rawHtmlMode ? (
                      <textarea
                        value={htmlContent}
                        rows={18}
                        onChange={(e) => setHtmlContent(e.target.value)}
                        className="w-full p-6 font-mono text-xs leading-relaxed text-ink-800 bg-ink-25/50 border-0 focus:outline-none"
                        placeholder="Enter HTML source here..."
                      />
                    ) : (
                      <div
                        ref={editorRef}
                        contentEditable
                        onInput={handleEditorInput}
                        className="min-h-[420px] p-6 focus:outline-none text-ink-900 leading-relaxed [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:text-ink-950 [&>h2]:mt-6 [&>h2]:mb-3 [&>h3]:text-lg [&>h3]:font-bold [&>h3]:text-ink-900 [&>h3]:mt-5 [&>h3]:mb-2 [&>p]:mb-3 [&>p]:text-base [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-4 [&>li]:mb-1.5 [&>blockquote]:border-l-4 [&>blockquote]:border-brand-500 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-ink-600 [&>blockquote]:my-4 [&>hr]:my-6 [&>hr]:border-ink-200"
                      />
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === "contact" && (
        <Card className="max-w-2xl">
          <CardHeader
            title="Official Contact Details"
            description="Essential contact information displayed to users across the website and support channels."
            action={
              <Button
                size="sm"
                loading={saveContact.isPending}
                onClick={() => saveContact.mutate(undefined)}
              >
                <Save className="size-4" /> Save Contact Details
              </Button>
            }
          />
          <CardBody>
            {contactQuery.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveContact.mutate(undefined);
                }}
              >
                <Field label="Support Email">
                  {(id) => (
                    <Input
                      id={id}
                      type="email"
                      value={contact.email ?? ""}
                      onChange={(e) => setContact({ ...contact, email: e.target.value })}
                      placeholder="support@caresaath.com"
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

                <div className="flex justify-end pt-3">
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
