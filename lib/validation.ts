import { z } from 'zod'

export function normalizeSubreddit(value: string): string {
  return value.trim().replace(/^r\//i, '')
}

const ChatMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.unknown(),
})

export const SuggestSubredditsSchema = z.object({
  icp_description: z.string().min(10).max(500),
})

export const DiscoverSchema = z.object({
  icp_description: z.string().min(10).max(500),
  subreddits: z
    .array(z.string().min(2).max(50).transform(normalizeSubreddit))
    .max(5)
    .optional(),
})

export const ChatSchema = z.object({
  segment_id: z.string().uuid(),
  messages: z.array(ChatMessageSchema).max(50),
})

export type DiscoverInput = z.infer<typeof DiscoverSchema>
export type ChatInput = z.infer<typeof ChatSchema>
