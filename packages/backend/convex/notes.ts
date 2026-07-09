import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getUserId, requireUserId } from "./auth";

// Get all notes for a specific user
export const getNotes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("notes")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
  },
});

// Get note for a specific note
export const getNote = query({
  args: {
    id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id } = args;
    if (!id) return null;

    const normalizedId = ctx.db.normalizeId("notes", id);
    if (!normalizedId) return null;

    const userId = await getUserId(ctx);
    if (!userId) return null;

    const note = await ctx.db.get(normalizedId);
    if (!note || note.userId !== userId) return null;

    return note;
  },
});

// Create a new note for a user
export const createNote = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    isSummary: v.boolean(),
  },
  handler: async (ctx, { title, content, isSummary }) => {
    const userId = await requireUserId(ctx);
    const noteId = await ctx.db.insert("notes", { userId, title, content });

    if (isSummary) {
      await ctx.scheduler.runAfter(0, internal.openai.summary, {
        id: noteId,
        title,
        content,
      });
    }

    return noteId;
  },
});

export const deleteNote = mutation({
  args: {
    noteId: v.id("notes"),
  },
  handler: async (ctx, { noteId }) => {
    const userId = await requireUserId(ctx);
    const note = await ctx.db.get(noteId);

    if (!note) throw new Error(`Note '${noteId}' could not be found`);

    if (note.userId !== userId)
      throw new Error(`User '${userId}' cannot delete note '${noteId}'`);

    await ctx.db.delete(noteId);
  },
});
