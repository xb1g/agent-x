module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/lib/db.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "chunkText",
    ()=>chunkText,
    "createSegment",
    ()=>createSegment,
    "getSegment",
    ()=>getSegment,
    "querySimilar",
    ()=>querySimilar,
    "updateSegment",
    ()=>updateSegment,
    "upsertChunks",
    ()=>upsertChunks,
    "upsertPost",
    ()=>upsertPost
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$supabase$2b$supabase$2d$js$40$2$2e$99$2e$3$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/@supabase+supabase-js@2.99.3/node_modules/@supabase/supabase-js/dist/index.mjs [app-route] (ecmascript) <locals>");
;
let cachedClient = null;
function getSupabase() {
    if (cachedClient) {
        return cachedClient;
    }
    const url = ("TURBOPACK compile-time value", "http://127.0.0.1:54321");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
        throw new Error('Missing Supabase environment variables');
    }
    cachedClient = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$supabase$2b$supabase$2d$js$40$2$2e$99$2e$3$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(url, serviceRoleKey, {
        auth: {
            persistSession: false
        }
    });
    return cachedClient;
}
function chunkText(text, charsPerChunk = 1200) {
    if (!text) {
        return [];
    }
    const normalized = text.trim();
    if (!normalized) {
        return [];
    }
    const chunks = [];
    let cursor = 0;
    while(cursor < normalized.length){
        chunks.push(normalized.slice(cursor, cursor + charsPerChunk));
        cursor += charsPerChunk;
    }
    return chunks;
}
async function createSegment(icp_description, subreddits) {
    const { data, error } = await getSupabase().from('segments').insert({
        icp_description,
        subreddits,
        status: 'indexing'
    }).select('id').single();
    if (error) {
        throw error;
    }
    if (Array.isArray(data)) {
        return String(data[0]?.id ?? '');
    }
    return String(data.id);
}
async function getSegment(id) {
    const { data, error } = await getSupabase().from('segments').select('*').eq('id', id).single();
    if (error) {
        return null;
    }
    return data;
}
async function updateSegment(id, updates) {
    const { error } = await getSupabase().from('segments').update({
        ...updates,
        updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) {
        throw error;
    }
}
async function upsertPost(post) {
    const { data, error } = await getSupabase().from('posts').upsert(post, {
        onConflict: 'reddit_id'
    }).select('id').single();
    if (error) {
        return null;
    }
    return data.id;
}
async function upsertChunks(chunks) {
    if (chunks.length === 0) {
        return;
    }
    const { error } = await getSupabase().from('post_embeddings').insert(chunks);
    if (error) {
        throw error;
    }
}
async function querySimilar(segment_id, embedding, limit = 5) {
    const { data, error } = await getSupabase().rpc('match_embeddings', {
        query_embedding: embedding,
        match_segment_id: segment_id,
        match_count: limit
    });
    if (error || !Array.isArray(data)) {
        return [];
    }
    return data.map((row)=>typeof row?.chunk_text === 'string' ? row.chunk_text : null).filter((value)=>Boolean(value));
}
}),
"[project]/app/api/segment/[id]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.0.10_@opentelemetry+api@1.9.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db.ts [app-route] (ecmascript)");
;
;
async function resolveParams(context) {
    return await Promise.resolve(context.params);
}
async function GET(_req, context) {
    const { id } = await resolveParams(context);
    const segment = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSegment"])(id);
    if (!segment) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Segment not found'
        }, {
            status: 404
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(segment);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__b2a470d5._.js.map