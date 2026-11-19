"use client";

import { useQuery } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import clsx from "clsx";
import {
  Bold,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo,
  RemoveFormatting,
  Save,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";
import { useEffect, useState } from "react";
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

  const [rawHtmlMode, setRawHtmlMode] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");

  // Contact Info State
  const [contact, setContact] = useState<Partial<ContactInfo>>({});

  // TipTap Rich Text Editor Configuration (StarterKit v3 includes link, underline, and undo/redo by default)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          HTMLAttributes: {
            class: "text-brand-600 underline font-semibold hover:text-brand-700",
          },
        },
      }),
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "tiptap prose prose-ink max-w-none min-h-[460px] p-6 focus:outline-none leading-relaxed text-ink-900 " +
          "[&>h1]:text-3xl [&>h1]:font-extrabold [&>h1]:text-ink-950 [&>h1]:mb-4 [&>h1]:mt-6 " +
          "[&>h2]:text-2xl [&>h2]:font-bold [&>h2]:text-ink-950 [&>h2]:mb-3 [&>h2]:mt-6 " +
          "[&>h3]:text-xl [&>h3]:font-bold [&>h3]:text-ink-900 [&>h3]:mb-2 [&>h3]:mt-4 " +
          "[&>p]:mb-3 [&>p]:text-base [&>p]:leading-relaxed " +
          "[&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul>li]:mb-1 " +
          "[&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-4 [&>ol>li]:mb-1 " +
          "[&>blockquote]:border-l-4 [&>blockquote]:border-brand-500 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-ink-600 [&>blockquote]:my-4 " +
          "[&>pre]:bg-ink-900 [&>pre]:text-ink-100 [&>pre]:p-4 [&>pre]:rounded-xl [&>pre]:font-mono [&>pre]:text-sm [&>pre]:my-4 " +
          "[&>code]:bg-ink-100 [&>code]:text-brand-700 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:font-mono [&>code]:text-sm " +
          "[&>hr]:my-6 [&>hr]:border-ink-200",
      },
    },
    onUpdate: ({ editor: ed }) => {
      setHtmlContent(ed.getHTML());
    },
  });

  // Query Page Content
  const pageQuery = useQuery({
    queryKey: [...keys.editorial, "page", selectedSlug],
    queryFn: () => editorialApi.getPage(selectedSlug),
    enabled: tab === "pages",
  });

  // Sync loaded page content to TipTap editor
  useEffect(() => {
    if (pageQuery.data && editor) {
      const content = pageQuery.data.content || "";
      setHtmlContent(content);
      if (editor.getHTML() !== content) {
        editor.commands.setContent(content);
      }
    }
  }, [pageQuery.data, selectedSlug, editor]);

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
        : (editor?.getHTML() ?? htmlContent);
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

  const handleLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = prompt("Enter URL link (e.g. https://... or mailto:...):", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const toggleRawHtml = () => {
    if (rawHtmlMode) {
      setRawHtmlMode(false);
      if (editor) {
        editor.commands.setContent(htmlContent);
      }
    } else {
      if (editor) {
        setHtmlContent(editor.getHTML());
      }
      setRawHtmlMode(true);
    }
  };

  const currentPage = PAGES.find((p) => p.slug === selectedSlug);

  const textContent = editor?.getText() ?? "";
  const wordCount = textContent.trim() ? textContent.trim().split(/\s+/).length : 0;
  const charCount = textContent.length;

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

          {/* TipTap Rich Text Editor Main Card */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader
                title={`Editing: ${currentPage?.label ?? selectedSlug}`}
                description="Powered by TipTap rich text engine. Use formatting controls below to style headings, lists, links, and text."
                action={
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={toggleRawHtml}
                      title="Toggle raw HTML source view"
                    >
                      <Code className="size-4" /> {rawHtmlMode ? "TipTap Visual Editor" : "HTML Source"}
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
                    {/* TipTap Visual Toolbar */}
                    {!rawHtmlMode && editor && (
                      <div className="flex flex-wrap items-center gap-1 border-b border-ink-100 bg-ink-25/80 px-3 py-2">
                        {/* Heading / Block Controls */}
                        <div className="flex items-center gap-0.5 border-r border-ink-200 pr-2 mr-1">
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().setParagraph().run()}
                            title="Normal Paragraph"
                            className={clsx(
                              "rounded-lg px-2 py-1 text-xs font-semibold transition-colors",
                              editor.isActive("paragraph") && !editor.isActive("heading")
                                ? "bg-brand-100 text-brand-900 font-bold shadow-xs"
                                : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            Normal
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                            title="Heading 1"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("heading", { level: 1 })
                                ? "bg-brand-100 text-brand-900 font-bold shadow-xs"
                                : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <Heading1 className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                            title="Heading 2"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("heading", { level: 2 })
                                ? "bg-brand-100 text-brand-900 font-bold shadow-xs"
                                : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <Heading2 className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                            title="Heading 3"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("heading", { level: 3 })
                                ? "bg-brand-100 text-brand-900 font-bold shadow-xs"
                                : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <Heading3 className="size-4" />
                          </button>
                        </div>

                        {/* Inline Text Formatting */}
                        <div className="flex items-center gap-0.5 border-r border-ink-200 pr-2 mr-1">
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            title="Bold (Ctrl+B)"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("bold") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <Bold className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            title="Italic (Ctrl+I)"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("italic") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <Italic className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleUnderline().run()}
                            title="Underline (Ctrl+U)"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("underline") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <UnderlineIcon className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleStrike().run()}
                            title="Strikethrough"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("strike") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <Strikethrough className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleCode().run()}
                            title="Inline code"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("code") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <Code className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                            title="Code block"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("codeBlock") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <FileCode className="size-4" />
                          </button>
                        </div>

                        {/* Lists & Quotes */}
                        <div className="flex items-center gap-0.5 border-r border-ink-200 pr-2 mr-1">
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleBulletList().run()}
                            title="Bullet List"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("bulletList") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <List className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleOrderedList().run()}
                            title="Numbered List"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("orderedList") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <ListOrdered className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().toggleBlockquote().run()}
                            title="Quote"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("blockquote") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <Quote className="size-4" />
                          </button>
                        </div>

                        {/* Divider & Link */}
                        <div className="flex items-center gap-0.5 border-r border-ink-200 pr-2 mr-1">
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().setHorizontalRule().run()}
                            title="Horizontal Divider"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <Minus className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleLink}
                            title="Insert / Edit Link"
                            className={clsx(
                              "rounded-lg p-1.5 transition-colors",
                              editor.isActive("link") ? "bg-brand-100 text-brand-900 font-bold shadow-xs" : "text-ink-700 hover:bg-ink-100"
                            )}
                          >
                            <LinkIcon className="size-4" />
                          </button>
                        </div>

                        {/* Clear & History */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                            title="Clear Formatting"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
                          >
                            <RemoveFormatting className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().undo().run()}
                            disabled={!editor.can().undo()}
                            title="Undo (Ctrl+Z)"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100 disabled:opacity-30"
                          >
                            <Undo className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().redo().run()}
                            disabled={!editor.can().redo()}
                            title="Redo (Ctrl+Y)"
                            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100 disabled:opacity-30"
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
                      <div className="min-h-[460px] bg-white">
                        <EditorContent editor={editor} />
                      </div>
                    )}

                    {/* Editor Status Bar */}
                    <div className="flex flex-wrap items-center justify-between border-t border-ink-100 bg-ink-25/60 px-4 py-2 text-xs text-ink-500">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                          <Sparkles className="size-3 text-brand-600" /> TipTap WYSIWYG
                        </span>
                        <span>ProseMirror document engine</span>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums font-mono">
                        <span>{wordCount} words</span>
                        <span>·</span>
                        <span>{charCount} characters</span>
                      </div>
                    </div>
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
