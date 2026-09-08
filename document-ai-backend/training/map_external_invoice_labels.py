HF_LABELS = [
    "O",
    "B-INVOICE_NO", "I-INVOICE_NO",
    "B-INVOICE_DATE", "I-INVOICE_DATE",
    "B-SELLER", "I-SELLER",
    "B-CLIENT", "I-CLIENT",
    "B-SELLER_TAX_ID", "I-SELLER_TAX_ID",
    "B-CLIENT_TAX_ID", "I-CLIENT_TAX_ID",
    "B-IBAN", "I-IBAN",
    "B-ITEM_DESC", "I-ITEM_DESC",
    "B-ITEM_QTY", "I-ITEM_QTY",
    "B-ITEM_NET_PRICE", "I-ITEM_NET_PRICE",
    "B-ITEM_NET_WORTH", "I-ITEM_NET_WORTH",
    "B-ITEM_VAT", "I-ITEM_VAT",
    "B-ITEM_GROSS_WORTH", "I-ITEM_GROSS_WORTH",
    "B-TOTAL_NET_WORTH", "I-TOTAL_NET_WORTH",
    "B-TOTAL_VAT", "I-TOTAL_VAT",
    "B-TOTAL_GROSS_WORTH", "I-TOTAL_GROSS_WORTH",
    "B-DUE_DATE", "I-DUE_DATE",
    "B-PAYMENT_TERMS", "I-PAYMENT_TERMS",
    "B-CURRENCY", "I-CURRENCY",
    "B-SUBTOTAL", "I-SUBTOTAL",
    "B-DISCOUNT", "I-DISCOUNT",
    "B-SHIPPING", "I-SHIPPING"
]

TARGET = {
    "INVOICE_NO": "INVOICE_NUMBER",
    "INVOICE_DATE": "INVOICE_DATE",
    "DUE_DATE": "DUE_DATE",
    "SELLER": "SELLER_NAME",
    "SELLER_TAX_ID": "SELLER_TAX_ID",
    "CLIENT": "BUYER_NAME",
    "CLIENT_TAX_ID": "BUYER_TAX_ID",
    "TOTAL_NET_WORTH": "SUBTOTAL",
    "SUBTOTAL": "SUBTOTAL",
    "TOTAL_VAT": "VAT",
    "TOTAL_GROSS_WORTH": "TOTAL",
    "CURRENCY": "CURRENCY",
    "IBAN": "IBAN"
}

TARGET_ID = {
    "OTHER": 0,
    "INVOICE_NUMBER": 1,
    "INVOICE_DATE": 2,
    "DUE_DATE": 3,
    "SELLER_NAME": 4,
    "SELLER_TAX_ID": 5,
    "BUYER_NAME": 6,
    "BUYER_TAX_ID": 7,
    "SUBTOTAL": 8,
    "VAT": 9,
    "TOTAL": 10,
    "CURRENCY": 11,
    "IBAN": 12
}

def remap(label_id):
    if label_id == -100:
        return -100

    name = HF_LABELS[label_id]

    if name == "O":
        return TARGET_ID["OTHER"]

    entity = name[2:] if name.startswith(("B-", "I-")) else name
    mapped = TARGET.get(entity)

    if mapped is None:
        return TARGET_ID["OTHER"]

    return TARGET_ID[mapped]


if __name__ == "__main__":
    from datasets import load_from_disk
    from collections import Counter

    path = "document-ai-backend/datasets/external/layoutlmv3_invoice"
    ds = load_from_disk(path)

    before = Counter()
    after = Counter()

    for row in ds["train"]:
        for label in row["labels"]:
            if label != -100:
                before[HF_LABELS[label]] += 1
                after[remap(label)] += 1

    print("=== SOURCE LABELS ===")
    for k, v in before.most_common():
        print(f"{k:30} {v}")

    print("\n=== IMMAPP TARGET IDS ===")
    for k, v in sorted(after.items()):
        print(k, v)
