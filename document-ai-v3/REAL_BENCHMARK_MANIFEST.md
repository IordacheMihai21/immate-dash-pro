# document-ai-v3 — real-world benchmark manifest (Phase 3)

389 real Romanian invoices from `document-ai-backend/datasets/external/invoices_romanian/train/` (Roboflow-sourced real scanned invoices), ground truth decoded from `document-ai-backend/datasets/final_bilingual/layoutxlm_train.jsonl`'s token-level BIO-style labels (filtered to `source == "InvoicesRomanian_Roboflow" and split == "train"`).

18 documents excluded entirely for having zero non-OTHER labels (nothing to score):

- `roboflow_ro_train_15`
- `roboflow_ro_train_101`
- `roboflow_ro_train_142`
- `roboflow_ro_train_153`
- `roboflow_ro_train_176`
- `roboflow_ro_train_191`
- `roboflow_ro_train_206`
- `roboflow_ro_train_227`
- `roboflow_ro_train_233`
- `roboflow_ro_train_235`
- `roboflow_ro_train_240`
- `roboflow_ro_train_248`
- `roboflow_ro_train_301`
- `roboflow_ro_train_307`
- `roboflow_ro_train_348`
- `roboflow_ro_train_358`
- `roboflow_ro_train_367`
- `roboflow_ro_train_377`

## Known limitation: LayoutXLM training-set overlap

These images were part of the fine-tuned LayoutXLM model's own TRAINING data (the `train` split of `invoices_romanian`) -- a real, disclosed limitation, not hidden. They were explicitly **not** used to tune v2's TypeScript regex candidate engine (`src/lib/invoiceCandidateEngine.ts`); v2's own regex tuning happened against the separate `valid` split (`test_ro_real`), confirmed burned for comparison purposes by the user.

Practical consequence: **any accuracy specifically attributable to the LayoutXLM entity-proposal layer on this set should be read as an upper bound / directional signal, not a clean generalization number for that component** -- the model has seen these exact documents during training and may be partially recalling them rather than generalizing. This caveat does **not** apply to the primary comparison this phase cares about -- v2's regex/heuristic resolution architecture vs. v3's region-gating + relation resolution architecture -- since neither resolver's own logic was tuned against this set, only (potentially) the upstream entity-proposal model was exposed to it.

## Rule: eval subset stays untouched until the architecture is stable

Same rule as `BENCHMARK_MANIFEST.md` from the prior phase: do not inspect, debug against, or tune the resolver/engine choice using any `eval`-split document until the v3 resolver architecture is stable. Log any exception below in a changelog entry, same as the prior manifest's own discipline.

### Changelog

(none yet)

## Split

Deterministic: documents sorted by `document_id`, every 10th (index % 10 == 0) assigned to `dev`, rest to `eval`. **dev = 39, eval = 350**.

## Document list

| id | split | warning count |
|---|---|---|
| roboflow_ro_train_0 | dev | 2 |
| roboflow_ro_train_1 | eval | 4 |
| roboflow_ro_train_10 | eval | 4 |
| roboflow_ro_train_100 | eval | 4 |
| roboflow_ro_train_102 | eval | 6 |
| roboflow_ro_train_103 | eval | 2 |
| roboflow_ro_train_104 | eval | 9 |
| roboflow_ro_train_105 | eval | 3 |
| roboflow_ro_train_106 | eval | 5 |
| roboflow_ro_train_107 | eval | 2 |
| roboflow_ro_train_108 | dev | 5 |
| roboflow_ro_train_109 | eval | 3 |
| roboflow_ro_train_11 | eval | 5 |
| roboflow_ro_train_110 | eval | 5 |
| roboflow_ro_train_111 | eval | 2 |
| roboflow_ro_train_112 | eval | 3 |
| roboflow_ro_train_113 | eval | 1 |
| roboflow_ro_train_114 | eval | 1 |
| roboflow_ro_train_115 | eval | 3 |
| roboflow_ro_train_116 | eval | 1 |
| roboflow_ro_train_117 | dev | 2 |
| roboflow_ro_train_118 | eval | 2 |
| roboflow_ro_train_119 | eval | 3 |
| roboflow_ro_train_12 | eval | 4 |
| roboflow_ro_train_120 | eval | 3 |
| roboflow_ro_train_121 | eval | 5 |
| roboflow_ro_train_122 | eval | 6 |
| roboflow_ro_train_123 | eval | 2 |
| roboflow_ro_train_124 | eval | 1 |
| roboflow_ro_train_125 | eval | 2 |
| roboflow_ro_train_126 | dev | 4 |
| roboflow_ro_train_127 | eval | 2 |
| roboflow_ro_train_128 | eval | 2 |
| roboflow_ro_train_129 | eval | 1 |
| roboflow_ro_train_13 | eval | 4 |
| roboflow_ro_train_130 | eval | 3 |
| roboflow_ro_train_131 | eval | 3 |
| roboflow_ro_train_132 | eval | 5 |
| roboflow_ro_train_133 | eval | 2 |
| roboflow_ro_train_134 | eval | 3 |
| roboflow_ro_train_135 | dev | 4 |
| roboflow_ro_train_136 | eval | 0 |
| roboflow_ro_train_137 | eval | 2 |
| roboflow_ro_train_138 | eval | 3 |
| roboflow_ro_train_139 | eval | 3 |
| roboflow_ro_train_14 | eval | 2 |
| roboflow_ro_train_140 | eval | 1 |
| roboflow_ro_train_141 | eval | 1 |
| roboflow_ro_train_143 | eval | 1 |
| roboflow_ro_train_144 | eval | 3 |
| roboflow_ro_train_145 | dev | 5 |
| roboflow_ro_train_146 | eval | 1 |
| roboflow_ro_train_147 | eval | 5 |
| roboflow_ro_train_148 | eval | 3 |
| roboflow_ro_train_149 | eval | 3 |
| roboflow_ro_train_150 | eval | 5 |
| roboflow_ro_train_151 | eval | 2 |
| roboflow_ro_train_152 | eval | 3 |
| roboflow_ro_train_154 | eval | 3 |
| roboflow_ro_train_155 | eval | 0 |
| roboflow_ro_train_156 | dev | 4 |
| roboflow_ro_train_157 | eval | 3 |
| roboflow_ro_train_158 | eval | 4 |
| roboflow_ro_train_159 | eval | 6 |
| roboflow_ro_train_16 | eval | 3 |
| roboflow_ro_train_160 | eval | 1 |
| roboflow_ro_train_161 | eval | 1 |
| roboflow_ro_train_162 | eval | 0 |
| roboflow_ro_train_163 | eval | 3 |
| roboflow_ro_train_164 | eval | 3 |
| roboflow_ro_train_165 | dev | 5 |
| roboflow_ro_train_166 | eval | 3 |
| roboflow_ro_train_167 | eval | 4 |
| roboflow_ro_train_168 | eval | 5 |
| roboflow_ro_train_169 | eval | 3 |
| roboflow_ro_train_17 | eval | 0 |
| roboflow_ro_train_170 | eval | 4 |
| roboflow_ro_train_171 | eval | 5 |
| roboflow_ro_train_172 | eval | 6 |
| roboflow_ro_train_173 | eval | 3 |
| roboflow_ro_train_174 | dev | 2 |
| roboflow_ro_train_175 | eval | 1 |
| roboflow_ro_train_177 | eval | 3 |
| roboflow_ro_train_178 | eval | 5 |
| roboflow_ro_train_179 | eval | 0 |
| roboflow_ro_train_18 | eval | 3 |
| roboflow_ro_train_180 | eval | 4 |
| roboflow_ro_train_181 | eval | 4 |
| roboflow_ro_train_182 | eval | 3 |
| roboflow_ro_train_183 | eval | 2 |
| roboflow_ro_train_184 | dev | 6 |
| roboflow_ro_train_185 | eval | 2 |
| roboflow_ro_train_187 | eval | 1 |
| roboflow_ro_train_188 | eval | 6 |
| roboflow_ro_train_189 | eval | 1 |
| roboflow_ro_train_19 | eval | 4 |
| roboflow_ro_train_190 | eval | 4 |
| roboflow_ro_train_192 | eval | 4 |
| roboflow_ro_train_193 | eval | 6 |
| roboflow_ro_train_194 | eval | 3 |
| roboflow_ro_train_195 | dev | 2 |
| roboflow_ro_train_196 | eval | 3 |
| roboflow_ro_train_197 | eval | 2 |
| roboflow_ro_train_198 | eval | 3 |
| roboflow_ro_train_199 | eval | 2 |
| roboflow_ro_train_2 | eval | 4 |
| roboflow_ro_train_20 | eval | 2 |
| roboflow_ro_train_200 | eval | 3 |
| roboflow_ro_train_201 | eval | 1 |
| roboflow_ro_train_202 | eval | 3 |
| roboflow_ro_train_203 | dev | 5 |
| roboflow_ro_train_204 | eval | 1 |
| roboflow_ro_train_205 | eval | 3 |
| roboflow_ro_train_207 | eval | 3 |
| roboflow_ro_train_208 | eval | 3 |
| roboflow_ro_train_209 | eval | 3 |
| roboflow_ro_train_21 | eval | 5 |
| roboflow_ro_train_210 | eval | 5 |
| roboflow_ro_train_211 | eval | 3 |
| roboflow_ro_train_212 | eval | 5 |
| roboflow_ro_train_213 | dev | 2 |
| roboflow_ro_train_214 | eval | 3 |
| roboflow_ro_train_215 | eval | 2 |
| roboflow_ro_train_216 | eval | 5 |
| roboflow_ro_train_217 | eval | 2 |
| roboflow_ro_train_218 | eval | 2 |
| roboflow_ro_train_219 | eval | 1 |
| roboflow_ro_train_22 | eval | 2 |
| roboflow_ro_train_220 | eval | 3 |
| roboflow_ro_train_221 | eval | 3 |
| roboflow_ro_train_222 | dev | 2 |
| roboflow_ro_train_223 | eval | 6 |
| roboflow_ro_train_224 | eval | 5 |
| roboflow_ro_train_225 | eval | 3 |
| roboflow_ro_train_226 | eval | 3 |
| roboflow_ro_train_228 | eval | 4 |
| roboflow_ro_train_229 | eval | 3 |
| roboflow_ro_train_23 | eval | 2 |
| roboflow_ro_train_230 | eval | 3 |
| roboflow_ro_train_231 | eval | 1 |
| roboflow_ro_train_232 | dev | 3 |
| roboflow_ro_train_234 | eval | 3 |
| roboflow_ro_train_236 | eval | 5 |
| roboflow_ro_train_237 | eval | 4 |
| roboflow_ro_train_238 | eval | 3 |
| roboflow_ro_train_239 | eval | 6 |
| roboflow_ro_train_24 | eval | 5 |
| roboflow_ro_train_241 | eval | 4 |
| roboflow_ro_train_242 | eval | 5 |
| roboflow_ro_train_243 | eval | 2 |
| roboflow_ro_train_244 | dev | 3 |
| roboflow_ro_train_245 | eval | 2 |
| roboflow_ro_train_246 | eval | 3 |
| roboflow_ro_train_247 | eval | 5 |
| roboflow_ro_train_249 | eval | 0 |
| roboflow_ro_train_25 | eval | 4 |
| roboflow_ro_train_250 | eval | 0 |
| roboflow_ro_train_251 | eval | 3 |
| roboflow_ro_train_252 | eval | 0 |
| roboflow_ro_train_253 | eval | 2 |
| roboflow_ro_train_254 | dev | 2 |
| roboflow_ro_train_255 | eval | 2 |
| roboflow_ro_train_256 | eval | 2 |
| roboflow_ro_train_257 | eval | 3 |
| roboflow_ro_train_258 | eval | 5 |
| roboflow_ro_train_259 | eval | 6 |
| roboflow_ro_train_26 | eval | 0 |
| roboflow_ro_train_260 | eval | 2 |
| roboflow_ro_train_261 | eval | 3 |
| roboflow_ro_train_262 | eval | 4 |
| roboflow_ro_train_263 | dev | 2 |
| roboflow_ro_train_264 | eval | 1 |
| roboflow_ro_train_265 | eval | 4 |
| roboflow_ro_train_266 | eval | 4 |
| roboflow_ro_train_267 | eval | 0 |
| roboflow_ro_train_268 | eval | 5 |
| roboflow_ro_train_269 | eval | 2 |
| roboflow_ro_train_27 | eval | 5 |
| roboflow_ro_train_270 | eval | 2 |
| roboflow_ro_train_271 | eval | 3 |
| roboflow_ro_train_272 | dev | 4 |
| roboflow_ro_train_273 | eval | 1 |
| roboflow_ro_train_274 | eval | 3 |
| roboflow_ro_train_275 | eval | 1 |
| roboflow_ro_train_276 | eval | 1 |
| roboflow_ro_train_277 | eval | 1 |
| roboflow_ro_train_278 | eval | 3 |
| roboflow_ro_train_279 | eval | 4 |
| roboflow_ro_train_28 | eval | 4 |
| roboflow_ro_train_280 | eval | 3 |
| roboflow_ro_train_281 | dev | 3 |
| roboflow_ro_train_282 | eval | 2 |
| roboflow_ro_train_283 | eval | 3 |
| roboflow_ro_train_284 | eval | 0 |
| roboflow_ro_train_285 | eval | 0 |
| roboflow_ro_train_286 | eval | 6 |
| roboflow_ro_train_287 | eval | 1 |
| roboflow_ro_train_288 | eval | 3 |
| roboflow_ro_train_289 | eval | 5 |
| roboflow_ro_train_29 | eval | 2 |
| roboflow_ro_train_290 | dev | 3 |
| roboflow_ro_train_291 | eval | 2 |
| roboflow_ro_train_292 | eval | 3 |
| roboflow_ro_train_293 | eval | 0 |
| roboflow_ro_train_294 | eval | 5 |
| roboflow_ro_train_295 | eval | 0 |
| roboflow_ro_train_296 | eval | 3 |
| roboflow_ro_train_297 | eval | 3 |
| roboflow_ro_train_298 | eval | 7 |
| roboflow_ro_train_299 | eval | 3 |
| roboflow_ro_train_3 | dev | 3 |
| roboflow_ro_train_30 | eval | 4 |
| roboflow_ro_train_300 | eval | 4 |
| roboflow_ro_train_302 | eval | 3 |
| roboflow_ro_train_303 | eval | 3 |
| roboflow_ro_train_304 | eval | 3 |
| roboflow_ro_train_305 | eval | 5 |
| roboflow_ro_train_306 | eval | 7 |
| roboflow_ro_train_308 | eval | 2 |
| roboflow_ro_train_309 | eval | 0 |
| roboflow_ro_train_31 | dev | 2 |
| roboflow_ro_train_310 | eval | 2 |
| roboflow_ro_train_311 | eval | 2 |
| roboflow_ro_train_312 | eval | 1 |
| roboflow_ro_train_313 | eval | 1 |
| roboflow_ro_train_314 | eval | 3 |
| roboflow_ro_train_315 | eval | 2 |
| roboflow_ro_train_316 | eval | 4 |
| roboflow_ro_train_317 | eval | 0 |
| roboflow_ro_train_318 | eval | 4 |
| roboflow_ro_train_319 | dev | 2 |
| roboflow_ro_train_32 | eval | 3 |
| roboflow_ro_train_320 | eval | 2 |
| roboflow_ro_train_321 | eval | 5 |
| roboflow_ro_train_322 | eval | 3 |
| roboflow_ro_train_323 | eval | 3 |
| roboflow_ro_train_324 | eval | 6 |
| roboflow_ro_train_325 | eval | 2 |
| roboflow_ro_train_326 | eval | 2 |
| roboflow_ro_train_327 | eval | 0 |
| roboflow_ro_train_328 | dev | 2 |
| roboflow_ro_train_329 | eval | 3 |
| roboflow_ro_train_33 | eval | 1 |
| roboflow_ro_train_330 | eval | 5 |
| roboflow_ro_train_331 | eval | 4 |
| roboflow_ro_train_332 | eval | 5 |
| roboflow_ro_train_333 | eval | 0 |
| roboflow_ro_train_334 | eval | 6 |
| roboflow_ro_train_335 | eval | 5 |
| roboflow_ro_train_336 | eval | 3 |
| roboflow_ro_train_337 | dev | 2 |
| roboflow_ro_train_338 | eval | 2 |
| roboflow_ro_train_339 | eval | 2 |
| roboflow_ro_train_34 | eval | 2 |
| roboflow_ro_train_340 | eval | 3 |
| roboflow_ro_train_341 | eval | 5 |
| roboflow_ro_train_342 | eval | 4 |
| roboflow_ro_train_343 | eval | 1 |
| roboflow_ro_train_344 | eval | 2 |
| roboflow_ro_train_345 | eval | 5 |
| roboflow_ro_train_346 | dev | 2 |
| roboflow_ro_train_347 | eval | 2 |
| roboflow_ro_train_349 | eval | 4 |
| roboflow_ro_train_35 | eval | 3 |
| roboflow_ro_train_350 | eval | 3 |
| roboflow_ro_train_351 | eval | 5 |
| roboflow_ro_train_352 | eval | 1 |
| roboflow_ro_train_353 | eval | 4 |
| roboflow_ro_train_354 | eval | 8 |
| roboflow_ro_train_355 | eval | 5 |
| roboflow_ro_train_356 | dev | 6 |
| roboflow_ro_train_357 | eval | 5 |
| roboflow_ro_train_359 | eval | 3 |
| roboflow_ro_train_36 | eval | 5 |
| roboflow_ro_train_360 | eval | 4 |
| roboflow_ro_train_361 | eval | 3 |
| roboflow_ro_train_362 | eval | 1 |
| roboflow_ro_train_363 | eval | 5 |
| roboflow_ro_train_364 | eval | 5 |
| roboflow_ro_train_365 | eval | 2 |
| roboflow_ro_train_366 | dev | 2 |
| roboflow_ro_train_368 | eval | 1 |
| roboflow_ro_train_369 | eval | 4 |
| roboflow_ro_train_37 | eval | 2 |
| roboflow_ro_train_370 | eval | 2 |
| roboflow_ro_train_371 | eval | 1 |
| roboflow_ro_train_372 | eval | 5 |
| roboflow_ro_train_373 | eval | 7 |
| roboflow_ro_train_374 | eval | 3 |
| roboflow_ro_train_375 | eval | 2 |
| roboflow_ro_train_376 | dev | 3 |
| roboflow_ro_train_378 | eval | 2 |
| roboflow_ro_train_379 | eval | 1 |
| roboflow_ro_train_38 | eval | 4 |
| roboflow_ro_train_380 | eval | 3 |
| roboflow_ro_train_381 | eval | 6 |
| roboflow_ro_train_382 | eval | 5 |
| roboflow_ro_train_383 | eval | 4 |
| roboflow_ro_train_384 | eval | 2 |
| roboflow_ro_train_385 | eval | 4 |
| roboflow_ro_train_386 | dev | 3 |
| roboflow_ro_train_387 | eval | 3 |
| roboflow_ro_train_388 | eval | 5 |
| roboflow_ro_train_389 | eval | 2 |
| roboflow_ro_train_39 | eval | 2 |
| roboflow_ro_train_390 | eval | 3 |
| roboflow_ro_train_391 | eval | 0 |
| roboflow_ro_train_392 | eval | 1 |
| roboflow_ro_train_393 | eval | 3 |
| roboflow_ro_train_394 | eval | 4 |
| roboflow_ro_train_395 | dev | 3 |
| roboflow_ro_train_396 | eval | 1 |
| roboflow_ro_train_397 | eval | 2 |
| roboflow_ro_train_398 | eval | 4 |
| roboflow_ro_train_399 | eval | 3 |
| roboflow_ro_train_4 | eval | 2 |
| roboflow_ro_train_40 | eval | 3 |
| roboflow_ro_train_400 | eval | 2 |
| roboflow_ro_train_401 | eval | 4 |
| roboflow_ro_train_402 | eval | 1 |
| roboflow_ro_train_403 | dev | 4 |
| roboflow_ro_train_404 | eval | 5 |
| roboflow_ro_train_405 | eval | 2 |
| roboflow_ro_train_406 | eval | 4 |
| roboflow_ro_train_407 | eval | 6 |
| roboflow_ro_train_408 | eval | 5 |
| roboflow_ro_train_41 | eval | 5 |
| roboflow_ro_train_42 | eval | 4 |
| roboflow_ro_train_43 | eval | 3 |
| roboflow_ro_train_44 | eval | 2 |
| roboflow_ro_train_45 | dev | 4 |
| roboflow_ro_train_46 | eval | 5 |
| roboflow_ro_train_47 | eval | 1 |
| roboflow_ro_train_48 | eval | 2 |
| roboflow_ro_train_49 | eval | 2 |
| roboflow_ro_train_5 | eval | 6 |
| roboflow_ro_train_50 | eval | 4 |
| roboflow_ro_train_51 | eval | 1 |
| roboflow_ro_train_52 | eval | 5 |
| roboflow_ro_train_53 | eval | 2 |
| roboflow_ro_train_54 | dev | 2 |
| roboflow_ro_train_55 | eval | 3 |
| roboflow_ro_train_56 | eval | 5 |
| roboflow_ro_train_57 | eval | 3 |
| roboflow_ro_train_58 | eval | 2 |
| roboflow_ro_train_59 | eval | 7 |
| roboflow_ro_train_6 | eval | 0 |
| roboflow_ro_train_60 | eval | 0 |
| roboflow_ro_train_61 | eval | 3 |
| roboflow_ro_train_62 | eval | 6 |
| roboflow_ro_train_63 | dev | 2 |
| roboflow_ro_train_65 | eval | 1 |
| roboflow_ro_train_66 | eval | 1 |
| roboflow_ro_train_67 | eval | 2 |
| roboflow_ro_train_68 | eval | 2 |
| roboflow_ro_train_69 | eval | 2 |
| roboflow_ro_train_7 | eval | 5 |
| roboflow_ro_train_70 | eval | 4 |
| roboflow_ro_train_71 | eval | 4 |
| roboflow_ro_train_72 | eval | 2 |
| roboflow_ro_train_73 | dev | 5 |
| roboflow_ro_train_74 | eval | 5 |
| roboflow_ro_train_75 | eval | 1 |
| roboflow_ro_train_76 | eval | 0 |
| roboflow_ro_train_77 | eval | 3 |
| roboflow_ro_train_78 | eval | 5 |
| roboflow_ro_train_79 | eval | 3 |
| roboflow_ro_train_8 | eval | 3 |
| roboflow_ro_train_80 | eval | 2 |
| roboflow_ro_train_81 | eval | 5 |
| roboflow_ro_train_82 | dev | 5 |
| roboflow_ro_train_83 | eval | 2 |
| roboflow_ro_train_84 | eval | 5 |
| roboflow_ro_train_85 | eval | 1 |
| roboflow_ro_train_86 | eval | 3 |
| roboflow_ro_train_87 | eval | 2 |
| roboflow_ro_train_88 | eval | 2 |
| roboflow_ro_train_89 | eval | 2 |
| roboflow_ro_train_9 | eval | 2 |
| roboflow_ro_train_90 | eval | 2 |
| roboflow_ro_train_91 | dev | 3 |
| roboflow_ro_train_92 | eval | 2 |
| roboflow_ro_train_93 | eval | 2 |
| roboflow_ro_train_94 | eval | 4 |
| roboflow_ro_train_95 | eval | 2 |
| roboflow_ro_train_96 | eval | 0 |
| roboflow_ro_train_97 | eval | 1 |
| roboflow_ro_train_98 | eval | 4 |
| roboflow_ro_train_99 | eval | 3 |
