# ZKS Bildirim Merkezi

The ZKS Shopify Admin içindeki "ZKS Bildirim Merkezi" uygulamasının sayfaları.

- `index.html` — başlatıcı. Shopify App Bridge'i yükler, `panel.html`'i okuyup sayfaya yerleştirir. Okunamazsa Shopify'daki yedek kopyayı (shop metafield `zks_app.bildirim_merkezi_html`) kullanır.
- `panel.html` — panelin kendisi: stok / fiyat alarmı talepleri, yarım kalan ödemeler, WhatsApp şablonları, kupon üretimi.

Veriler Shopify'da tutulur (metaobject `zks_bildirim_talebi`, `zks_sepet_takibi`; ayarlar shop metafield `zks_app.bildirim_ayarlar`). Bu depoda müşteri verisi veya gizli anahtar yoktur.
