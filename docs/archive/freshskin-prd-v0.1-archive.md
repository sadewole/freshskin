# FreshSkin: Product Requirements Document

**Status:** Draft v0.1 | **Owner:** Product / Engineering | **Last updated:** November 2, 2026

## 1. Overview

FreshSkin is an AI-powered personal care assistant that helps people choose body care and fragrance products that actually suit them. Users take a photo of their skin and the app analyses texture and skin tone to recommend body creams. They can scan a product's ingredient list to find out whether it is a good fit. The next phase extends FreshSkin into perfume recommendation, so one app covers both what goes on your skin and what you smell like.

## 2. Problem Statement

- People buy body creams by brand, price or packaging, then discover later that the product dries their skin, causes breakouts or does not suit their skin tone.
- Ingredient lists are long, technical and hard to judge at a glance.
- Perfume buying is mostly trial and error. Fragrances behave differently on different skin, and people waste money on bottles they rarely wear.
- No single tool treats skin, body care and fragrance as one connected profile.

## 3. Goals and Non-Goals

### Goals

1. Give personalised body cream recommendations from a skin photo in under 30 seconds.
2. Let users scan any cream's ingredient list and get a clear verdict (good, okay, avoid) with reasons.
3. Recommend perfumes based on the user's preferences, skin profile, climate and occasion.
4. Build a saved skin and preference profile that improves recommendations over time.

### Non-Goals (v1)

- Medical diagnosis or treatment of skin conditions.
- Hair care, makeup or facial skincare.
- In-app checkout or being a marketplace (affiliate links may come later).
- Fragrance creation or custom blending.

## 4. Target Users

| Persona | Description | Main need |
| --- | --- | --- |
| The confused buyer | Buys creams and perfumes by trial and error | Confidence before purchase |
| The ingredient-conscious user | Reads labels but cannot interpret them | Fast, trustworthy ingredient verdicts |
| The fragrance explorer | Wants new scents but fears blind buys | Recommendations matched to taste and skin |
| The gift buyer | Shops for someone else | Safe, well-matched suggestions |

## 5. Core Features

### 5.1 Skin Analysis (existing)

- Camera capture of a skin area, with guidance for lighting and framing.
- AI analysis of texture (dry, normal, oily, uneven, etc.) and skin tone.
- Results saved to the user's profile, with history over time.

### 5.2 Body Cream Recommendation (existing)

- Ranked list of recommended creams with a short reason for each.
- Filters: budget, fragrance-free, vegan, availability.

### 5.3 Ingredient Scanner (existing)

- User photographs a product's ingredient list; the app reads it via OCR.
- Output: overall verdict, flagged ingredients, beneficial ingredients, and a plain-language explanation.
- Verdict is personalised against the saved skin profile.

### 5.4 Perfume Recommendation (new)

**Preference intake**

- Short onboarding quiz: favoured scent families (floral, woody, citrus, oriental, fresh, gourmand), scents they dislike, perfumes they already own and love.
- Occasion and context: daily, office, evening, special events.
- Climate and season, since heat and humidity change how fragrances perform.
- Strength preference (light to long-lasting) and budget range.

**Recommendation engine**

- Suggests perfumes with scent notes (top, heart, base), expected longevity and projection, and a match score with a reason.
- "Similar to" search: the user enters a perfume they like and gets close alternatives, including lower-priced options.
- Skin-aware guidance, for example that very dry skin tends to hold fragrance less well, with a tip such as pairing with a matching body cream.
- Allergen and sensitivity flags: users can list ingredients they react to, and the app warns when a perfume contains them.

**Cross-product pairing**

- Suggests a body cream and perfume that work together, for example an unscented or complementary lotion for a layered fragrance.
- Warns when a cream's fragrance may clash with the user's perfume.

**Perfume scanner (stretch)**

- User snaps a bottle or box and the app returns notes, a match score and similar options.

### 5.5 User Profile and History

- Skin data, scent preferences, allergies, saved products and past scans in one place.
- Wishlist and "owned" lists, with the option to rate products after use so recommendations improve.

## 6. User Stories

1. As a user, I want to photograph my skin and get cream recommendations so I stop guessing.
2. As a user, I want to scan a cream's ingredients so I know whether it suits me before buying.
3. As a user, I want perfume suggestions based on scents I like so I can discover new ones with less risk.
4. As a user, I want to find cheaper alternatives to a perfume I love.
5. As a user with sensitivities, I want warnings about ingredients I react to.
6. As a returning user, I want my profile saved so I do not repeat the setup.

## 7. User Flow (Primary)

1. Onboard: create an account, grant camera permission, complete the scent preference quiz.
2. Analyse: take a skin photo and review the result.
3. Choose a path: body cream recommendation, perfume recommendation, or scan a product.
4. Review recommendations, save favourites, or open details.
5. Return later: rate products, rescan skin, refine preferences.

## 8. Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Capture and analyse a skin photo for texture and tone | P0 |
| FR-2 | Save skin analysis results to the user profile | P0 |
| FR-3 | Recommend body creams matched to the profile | P0 |
| FR-4 | OCR-read an ingredient list and return a verdict | P0 |
| FR-5 | Scent preference quiz and saved fragrance profile | P0 |
| FR-6 | Perfume recommendations with notes, longevity and match reason | P0 |
| FR-7 | Allergen and sensitivity flagging across creams and perfumes | P1 |
| FR-8 | "Similar to" perfume search with price alternatives | P1 |
| FR-9 | Cream and perfume pairing suggestions | P1 |
| FR-10 | Ratings and feedback loop for personalisation | P1 |
| FR-11 | Perfume bottle scanner | P2 |
| FR-12 | Wishlist and owned-products lists | P2 |

## 9. Non-Functional Requirements

- **Performance:** analysis and scan results returned in under 10 seconds for typical connections; graceful behaviour on slow networks.
- **Privacy and security:** skin photos are sensitive personal data. Collect explicit consent, encrypt in transit and at rest, allow users to delete photos and their data at any time, and avoid using images for model training without opt-in.
- **Accuracy and fairness:** skin tone and texture analysis must perform well across the full range of skin tones. Test on diverse datasets before launch and monitor for bias.
- **Reliability:** clear fallbacks when image quality is poor (prompt to retake).
- **Platform:** mobile-first (iOS and Android), with accessibility support such as scalable text and screen reader labels.
- **Compliance:** follow applicable data protection law (for example NDPR in Nigeria and GDPR for EU users), and avoid medical claims.

## 10. Data and AI Considerations

- **Product data:** needs a catalogue of creams and perfumes with ingredients, notes, price and availability. Sources could be licensed databases, brand data and community-contributed entries. Local availability matters, particularly for African markets.
- **Ingredient knowledge base:** a maintained mapping of ingredients to benefits, irritants and skin-type suitability, reviewed against reputable dermatological sources.
- **Recommendation logic:** combine rule-based filters (allergens, budget) with AI ranking (profile match, similarity).
- **Perfume matching:** note-based similarity plus user feedback. Be transparent that fragrance is subjective and results are suggestions.
- **Explainability:** every recommendation shows a short reason so users can trust and correct it.
- **Disclaimers:** FreshSkin is not a medical device. Users with skin conditions or severe allergies are directed to a professional.

## 11. Success Metrics

| Metric | Target (first 6 months, to be validated) |
| --- | --- |
| Activation: completed skin analysis or scent quiz | 60% of new users |
| Weekly active users / monthly active users | 25% |
| Recommendations saved or tapped | 40% of sessions |
| Ingredient scans per active user per month | 3+ |
| Perfume recommendation satisfaction (thumbs up) | 70% positive |
| 30-day retention | 20% |
| Share of users using both cream and perfume features | 30% |

## 12. Release Plan

- **Phase 1 (existing):** skin analysis, cream recommendation, ingredient scanner.
- **Phase 2:** scent quiz, perfume recommendation, allergen flags, richer profile.
- **Phase 3:** similar-to search, cream and perfume pairing, ratings loop.
- **Phase 4:** perfume scanner, wishlist, affiliate links or retailer partnerships.

## 13. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Skin analysis inaccuracy, especially across skin tones | Diverse test data, confidence scores, retake prompts |
| Privacy concerns around face and skin photos | Clear consent, on-device processing where possible, easy deletion |
| Perfume taste is subjective | Preference quiz, feedback loop, "similar to" anchoring |
| Incomplete or inaccurate product data | Trusted data sources, user corrections, regular audits |
| Users treat results as medical advice | Clear disclaimers and referral language |
| Low retention after first use | Reminders for rescans, new-arrival alerts, profile-based discovery |

## 14. Open Questions

1. Which markets and currencies launch first, and how will local product availability be sourced?
2. Is the business model free with affiliate revenue, subscription, or freemium?
3. Will perfume recommendations use skin analysis at all, or rely mainly on stated preferences?
4. Build or license the product and ingredient database?
5. Is on-device image processing feasible for the current architecture?
6. Are there brand partnerships to pursue at launch?
