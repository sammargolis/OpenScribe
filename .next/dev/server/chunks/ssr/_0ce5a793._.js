module.exports = [
"[project]/app/actions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"40b2687437ea74cc4409f66ee4a755835b9c89eea3":"generateClinicalNote","60131ca343eff8da86fa092aac608eadb8489c6878":"transcribeAudio"},"",""] */ __turbopack_context__.s([
    "generateClinicalNote",
    ()=>generateClinicalNote,
    "transcribeAudio",
    ()=>transcribeAudio
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$3_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.0.3_@opentelemetry+api@1.9.0_react-dom@19.2.0_react@19.2.0__react@19.2.0/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$ai$40$5$2e$0$2e$102_zod$40$3$2e$25$2e$76$2f$node_modules$2f$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/ai@5.0.102_zod@3.25.76/node_modules/ai/dist/index.mjs [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$ai$2d$sdk$2b$openai$40$2$2e$0$2e$72_zod$40$3$2e$25$2e$76$2f$node_modules$2f40$ai$2d$sdk$2f$openai$2f$dist$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/@ai-sdk+openai@2.0.72_zod@3.25.76/node_modules/@ai-sdk/openai/dist/index.mjs [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$3_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.0.3_@opentelemetry+api@1.9.0_react-dom@19.2.0_react@19.2.0__react@19.2.0/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
async function transcribeAudio(audioBlob, apiKey) {
    // For demo purposes, we'll simulate transcription
    // In production, you would use Whisper API with the provided apiKey
    // Simulate processing time
    await new Promise((resolve)=>setTimeout(resolve, 2000));
    // For now, return a sample transcript
    // In production: send audioBlob to Whisper API with apiKey
    const sampleTranscript = `
Doctor: Good morning, how are you feeling today?

Patient: Not great, doctor. I've been having this persistent headache for about a week now.

Doctor: I see. Can you describe the headache? Where is it located and how severe is it?

Patient: It's mostly on the right side of my head, kind of behind my eye. I'd say it's about a 6 or 7 out of 10 on bad days.

Doctor: Does anything make it better or worse?

Patient: It gets worse when I'm looking at screens for too long. Resting in a dark room helps a bit.

Doctor: Any other symptoms? Nausea, sensitivity to light, visual changes?

Patient: Yeah, I've been a bit sensitive to bright lights. No nausea though.

Doctor: Have you been under any unusual stress lately? Any changes in sleep patterns?

Patient: Work has been pretty stressful. I've been sleeping maybe 5-6 hours a night instead of my usual 8.

Doctor: Let me check your blood pressure and do a quick neurological exam.

[Physical exam performed]

Doctor: Your blood pressure is slightly elevated at 135/85. Neurological exam is normal. Based on your symptoms - the unilateral headache, photophobia, and association with stress and sleep deprivation - this appears to be a tension-type headache with some migraine features.

Patient: Is that serious?

Doctor: It's very manageable. I'd recommend starting with lifestyle modifications - prioritizing sleep, taking regular breaks from screens, and stress management. I'll also prescribe a mild pain reliever for acute episodes. If it doesn't improve in two weeks, we'll discuss preventive options.
  `.trim();
    return sampleTranscript;
}
async function generateClinicalNote(params) {
    const { transcript, patient_name, visit_reason, apiKey } = params;
    const systemPrompt = `You are a clinical documentation assistant that converts patient encounter transcripts into structured clinical notes.

IMPORTANT INSTRUCTIONS:
- Output ONLY plain text in the exact format shown below
- Do NOT use JSON, markdown code blocks, or any special formatting
- Use ONLY information explicitly stated in the transcript
- If a section has no relevant information, write "Not discussed"
- Use professional medical terminology while keeping notes concise
- This is a DRAFT that requires clinician review

OUTPUT FORMAT (follow exactly):

Chief Complaint:
[Primary reason for visit in 1-2 sentences]

HPI:
[History of present illness - onset, duration, character, severity, modifying factors]

ROS:
[Review of systems - symptoms mentioned, organized by system]

Physical Exam:
[Any exam findings mentioned, or "Not documented" if none]

Assessment:
[Clinical assessment/diagnosis mentioned by clinician]

Plan:
[Treatment plan discussed with patient]`;
    const userPrompt = `Convert this clinical encounter into a structured note.

Patient Name: ${patient_name || "Not provided"}
Visit Reason: ${visit_reason || "Not provided"}

TRANSCRIPT:
${transcript}

Generate the clinical note now, following the exact format specified.`;
    try {
        if (apiKey) {
            const openai = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$ai$2d$sdk$2b$openai$40$2$2e$0$2e$72_zod$40$3$2e$25$2e$76$2f$node_modules$2f40$ai$2d$sdk$2f$openai$2f$dist$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createOpenAI"])({
                apiKey
            });
            const { text } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$ai$40$5$2e$0$2e$102_zod$40$3$2e$25$2e$76$2f$node_modules$2f$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["generateText"])({
                model: openai("gpt-4o"),
                system: systemPrompt,
                prompt: userPrompt
            });
            return text;
        } else {
            // Fallback to AI Gateway (no API key needed)
            const { text } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$ai$40$5$2e$0$2e$102_zod$40$3$2e$25$2e$76$2f$node_modules$2f$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["generateText"])({
                model: "openai/gpt-4o",
                system: systemPrompt,
                prompt: userPrompt
            });
            return text;
        }
    } catch (error) {
        console.error("AI generation error:", error);
        throw new Error(`Failed to generate note: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$3_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    transcribeAudio,
    generateClinicalNote
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$3_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(transcribeAudio, "60131ca343eff8da86fa092aac608eadb8489c6878", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$3_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(generateClinicalNote, "40b2687437ea74cc4409f66ee4a755835b9c89eea3", null);
}),
"[project]/.next-internal/server/app/page/actions.js { ACTIONS_MODULE0 => \"[project]/app/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/actions.ts [app-rsc] (ecmascript)");
;
;
}),
"[project]/.next-internal/server/app/page/actions.js { ACTIONS_MODULE0 => \"[project]/app/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "40b2687437ea74cc4409f66ee4a755835b9c89eea3",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["generateClinicalNote"],
    "60131ca343eff8da86fa092aac608eadb8489c6878",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["transcribeAudio"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/page/actions.js { ACTIONS_MODULE0 => "[project]/app/actions.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/actions.ts [app-rsc] (ecmascript)");
}),
];

//# sourceMappingURL=_0ce5a793._.js.map