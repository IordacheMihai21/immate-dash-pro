# FATURA reviewed label report

Status: **reviewed and inferred, not official**. No official label map was found in the archive.
The recommendations below come from all 8,600 valid hugg annotations, the matching COCO region
classes, and the sample evidence stored in `annotation_report.json`.

| ID | Current inferred name | Sample tokens/spans | Sample documents | Clarity | Recommended final semantic name |
|---:|---|---|---|---|---|
| 0 | `SELLER_WEBSITE` | `www.ThompsonandSons.org`; `www.BuchananandSons.com` | `Template1_Instance0`, `Template1_Instance100` | Clear: tokens are seller/company websites. | `SELLER_WEBSITE` |
| 1 | `TOTAL_BLOCK` | `TOTAL 1060.47 $`; `TOTAL 213.65 EUR` | `Template13_Instance0`, `Template13_Instance100` | Clear: the label covers the heading, amount, and currency, so it is a block rather than only the numeric value. | `TOTAL_BLOCK` |
| 2 | `TOTAL_IN_WORDS_BLOCK` | `Total in words one thousand ...`; `Total in words two hundred ...` | `Template13_Instance0`, `Template13_Instance100` | Clear: complete textual-total region. | `TOTAL_IN_WORDS_BLOCK` |
| 3 | `INVOICE_DATE_BLOCK` | `Invoice Date 26-Jan-2000`; `Date 19-Mar-2015` | `Template13_Instance0`, `Template13_Instance100` | Clear: label and date value are grouped. | `INVOICE_DATE_BLOCK` |
| 4 | `DUE_DATE_BLOCK` | `Due Date 17-Nov-1993`; `Due Date 18-May-2008` | `Template13_Instance0`, `Template13_Instance100` | Clear. | `DUE_DATE_BLOCK` |
| 5 | `BUYER_BLOCK` | `Bill to Michael Greene ...`; `Buyer Michael Johnson ...` | `Template14_Instance0`, `Template14_Instance102` | Meaning is clear at a broad level: billing recipient/buyer plus address and contacts. Its boundary versus label 8 is dataset-specific and not officially documented. | `BUYER_BLOCK` |
| 6 | `SUPPLIER_NAME` | `Fernandez PLC`; `Faulkner LLC`; `Berg, Ward and Wright` | `Template13_Instance0`, `Template13_Instance100` | Clear: supplier/seller name only. | `SUPPLIER_NAME` |
| 8 | `BILL_TO_BLOCK` | `BILL_TO Jason Roberts ...`; `BILL_TO Gregory Martin ...` | `Template27_Instance0`, `Template27_Instance100` | Clear as the explicit `BILL_TO` recipient block. Why FATURA separates it from label 5 remains uncertain; preserve both IDs during training. | `BILL_TO_BLOCK` |
| 9 | `SHIP_TO_BLOCK` | `SHIP_TO Brandi Sosa ...`; `SHIP_TO Barbara Harrison ...` | `Template18_Instance0`, `Template18_Instance100` | Clear. | `SHIP_TO_BLOCK` |
| 10 | `TABLE_REGION` | synthetic token `table` | `Template13_Instance0`, `Template13_Instance100` | Clear as a region anchor, not ordinary OCR text. | `TABLE_REGION` |
| 11 | `LOGO_REGION` | synthetic token `logo` | `Template13_Instance0`, `Template13_Instance100` | Clear as a region anchor. | `LOGO_REGION` |
| 12 | `INVOICE_NUMBER_BLOCK` | `INVOICE # INV/57-22/068`; `INVOICE ID INV23686355` | `Template14_Instance0`, `Template14_Instance102` | Clear: includes label tokens and identifier, not only the identifier value. | `INVOICE_NUMBER_BLOCK` |
| 13 | `OTHER` | terms, bank details, notes, invoice titles | `Template13_Instance0`, `Template13_Instance100` | Clear as a heterogeneous catch-all class; intentionally broad. | `OTHER` |

## Review conclusions

- Label 5 is no longer described vaguely as an address block. Evidence shows a complete
  buyer/billing-recipient block, including name, address, phone, email, and site.
- Labels 5 and 8 must remain separate IDs for reproducibility even though both concern the billing
  recipient. Collapsing them should be tested as a separate experiment, not silently performed.
- Labels 1, 2, 3, 4, and 12 are block labels. Training and downstream decoding must not assume
  that every token carrying those labels is the final scalar value.
- Labels 10 and 11 are synthetic region tokens (`table`, `logo`), useful for layout learning but
  different from normal OCR tokens.
