# AtlantaJake Listing Studio: standing product rule

The primary purpose of this project is to create excellent, accurate Depop listings for AtlantaJake. A successful CSV import, valid photo URL, passing software test, or properly capitalized title is not evidence that the listing is commercially useful.

- Treat explicit seller inventory facts as authoritative, including vintage status, year, size, feel, material, alterations, and condition. A photo's inability to prove a fact is not a contradiction. Put actual conflicts and photo limitations in private review notes, never customer sales copy.
- Keep distinctive identity, graphic text, supported era, garment type, and real condition information. Use natural buyer vocabulary in title, description, attributes, and five relevant hashtags. Avoid filler, internal verification language, unrelated trend terms, and invented brands or provenance.
- Assign category, age, color, source, and style for each item based on evidence. Leave optional attributes blank when unsupported. Do not preset Multi or Y2K across a batch.
- Seller-facing descriptions must sound like appealing product listings, with concrete item details and the store's required format. They are not inspection reports.
- Before telling Jake a quality fix is ready for hundreds of listings, compare real generated outputs against the seller source and photos for several distinct cases. Automated tests and prompts alone do not establish copy quality. Report the exact limits of testing and the cost of any further model run.

The detailed source-backed standard and representative crewneck cases are in `docs/LISTING_STANDARD.md`. The failed AJ1060 output is a regression case: it omitted seller-confirmed 1985 and softness and printed a copyright-year disclaimer in customer copy. Do not reintroduce that behavior.
