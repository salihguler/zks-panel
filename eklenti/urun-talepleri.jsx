import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

/* ZKS Talepler — ürün detay sayfası kutusu
   Bu ürün için: aktif stok talepleri (beden bazında), aktif fiyat alarmları,
   son 30 günde ödemesi yarım kalan sepetler. "Bildirim Merkezi'nde aç" ile panele geçer. */

const TALEP_SORGU = `query ZksTalepler($id: ID!, $after: String) {
  product(id: $id) {
    title
    variants(first: 100) { nodes { id title sku inventoryQuantity selectedOptions { name value } } }
  }
  metaobjects(type: "zks_bildirim_talebi", first: 100, after: $after, query: "fields.durum:aktif") {
    pageInfo { hasNextPage endCursor }
    nodes { fields { key value } }
  }
}`;

const SEPET_SORGU = `query ZksSepetler($q: String!, $after: String) {
  abandonedCheckouts(first: 100, after: $after, reverse: true, sortKey: CREATED_AT, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { completedAt shippingAddress { phone } billingAddress { phone } lineItems(first: 10) { nodes { quantity product { id } variant { id } } } }
  }
}`;

export default async () => {
  render(<Extension />, document.body);
};

function bedenAl(v) {
  const o = (v.selectedOptions || []).find((x) => /beden|size|boyut/i.test(x.name));
  if (o) return o.value;
  const p = String(v.title || '').split('/').map((x) => x.trim());
  return p[p.length - 1] || v.title;
}

function Extension() {
  const [durum, setDurum] = useState({yukleniyor: true});

  useEffect(() => {
    (async () => {
      try {
        const urunId = shopify.data.selected[0]?.id;
        let urun = null;
        const talepler = [];
        let after = null;
        for (let i = 0; i < 10; i++) {
          const {data, errors} = await shopify.query(TALEP_SORGU, {variables: {id: urunId, after}});
          if (!data) throw new Error((errors && errors[0]?.message) || 'Veri okunamadı');
          if (!urun) urun = data.product;
          data.metaobjects.nodes.forEach((n) => {
            const f = {};
            n.fields.forEach((x) => (f[x.key] = x.value));
            if (f.urun === urunId) talepler.push(f);
          });
          if (!data.metaobjects.pageInfo.hasNextPage) break;
          after = data.metaobjects.pageInfo.endCursor;
        }

        // Son 30 gün yarım kalan ödemeler (telefona göre tekilleştirilmiş)
        const bas = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const sepetVaryant = {};
        const sepetTel = new Set();
        let sepetHata = '';
        try {
          let a2 = null;
          for (let i = 0; i < 5; i++) {
            const {data} = await shopify.query(SEPET_SORGU, {variables: {q: 'created_at:>=' + bas, after: a2}});
            const ac = data && data.abandonedCheckouts;
            if (!ac) break;
            ac.nodes.forEach((c) => {
              if (c.completedAt) return;
              const tel = String((c.shippingAddress && c.shippingAddress.phone) || (c.billingAddress && c.billingAddress.phone) || '').replace(/\D/g, '').slice(-10);
              c.lineItems.nodes.forEach((li) => {
                if (!li.product || li.product.id !== urunId) return;
                const anahtar = tel || Math.random().toString();
                const vk = li.variant ? li.variant.id : '-';
                sepetVaryant[vk] = sepetVaryant[vk] || new Set();
                sepetVaryant[vk].add(anahtar);
                sepetTel.add(anahtar);
              });
            });
            if (!ac.pageInfo.hasNextPage) break;
            a2 = ac.pageInfo.endCursor;
          }
        } catch (e) {
          sepetHata = 'Yarım ödemeler okunamadı';
        }

        const varyantlar = (urun && urun.variants.nodes) || [];
        const vBul = (id) => varyantlar.find((v) => v.id === id);
        const satirlar = {};
        talepler.filter((t) => t.tip === 'stok').forEach((t) => {
          const v = vBul(t.varyant);
          const k = t.varyant || t.beden;
          const s = (satirlar[k] = satirlar[k] || {beden: v ? bedenAl(v) : t.beden || '-', stok: v ? v.inventoryQuantity : null, n: 0});
          s.n++;
        });
        const stokSatir = Object.values(satirlar).sort((a, b) => b.n - a.n);
        const fiyat = talepler.filter((t) => t.tip === 'fiyat');
        const fiyatBeden = {};
        fiyat.forEach((t) => (fiyatBeden[t.beden || '-'] = (fiyatBeden[t.beden || '-'] || 0) + 1));
        const sepetSatir = Object.keys(sepetVaryant)
          .map((vk) => {
            const v = vBul(vk);
            return {beden: v ? bedenAl(v) : '-', stok: v ? v.inventoryQuantity : null, n: sepetVaryant[vk].size};
          })
          .sort((a, b) => b.n - a.n);

        setDurum({
          yukleniyor: false,
          baslik: urun ? urun.title : '',
          stokSatir,
          stokToplam: stokSatir.reduce((t, s) => t + s.n, 0),
          stoktaBekleyen: stokSatir.filter((s) => s.stok > 0).reduce((t, s) => t + s.n, 0),
          fiyatToplam: fiyat.length,
          fiyatBeden,
          sepetToplam: sepetTel.size,
          sepetSatir,
          sepetHata,
        });
      } catch (e) {
        setDurum({yukleniyor: false, hata: e.message || String(e)});
      }
    })();
  }, []);

  if (durum.yukleniyor) {
    return (
      <s-admin-block heading="Müşteri talepleri">
        <s-spinner />
      </s-admin-block>
    );
  }
  if (durum.hata) {
    return (
      <s-admin-block heading="Müşteri talepleri">
        <s-banner tone="critical">Talepler okunamadı: {durum.hata}</s-banner>
      </s-admin-block>
    );
  }

  const ozet = [
    durum.stokToplam ? durum.stokToplam + ' stok talebi' : '',
    durum.fiyatToplam ? durum.fiyatToplam + ' fiyat alarmı' : '',
    durum.sepetToplam ? durum.sepetToplam + ' yarım ödeme' : '',
  ].filter(Boolean).join(' · ') || 'Talep yok';
  const panelLink = 'app:?ara=' + encodeURIComponent(durum.baslik || '');

  return (
    <s-admin-block heading="Müşteri talepleri" collapsedSummary={ozet}>
      <s-stack gap="base">
        {durum.stoktaBekleyen > 0 ? (
          <s-banner tone="warning">
            {durum.stoktaBekleyen} müşterinin beklediği beden şu an stokta. Bildirim Merkezi'nden WhatsApp ile haber verebilirsiniz.
          </s-banner>
        ) : null}

        <s-stack gap="small-200">
          <s-text type="strong">Stok talepleri (aktif): {durum.stokToplam}</s-text>
          {durum.stokSatir.length ? (
            durum.stokSatir.map((s) => (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text>{s.beden}: {s.n} kişi bekliyor</s-text>
                {s.stok == null ? null : s.stok > 0 ? (
                  <s-badge tone="success">Stokta: {s.stok}</s-badge>
                ) : (
                  <s-badge tone="critical">Stok yok</s-badge>
                )}
              </s-stack>
            ))
          ) : (
            <s-text color="subdued">Bu ürün için bekleyen stok talebi yok.</s-text>
          )}
        </s-stack>

        <s-stack gap="small-200">
          <s-text type="strong">Fiyat alarmları (aktif): {durum.fiyatToplam}</s-text>
          {durum.fiyatToplam ? (
            <s-text color="subdued">
              Bedenler: {Object.keys(durum.fiyatBeden).map((b) => b + (durum.fiyatBeden[b] > 1 ? ' ×' + durum.fiyatBeden[b] : '')).join(', ')}
            </s-text>
          ) : null}
        </s-stack>

        <s-stack gap="small-200">
          <s-text type="strong">Son 30 günde ödemesi yarım kalan: {durum.sepetToplam} müşteri</s-text>
          {durum.sepetHata ? <s-text color="subdued">{durum.sepetHata}</s-text> : null}
          {durum.sepetSatir.map((s) => (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text>{s.beden}: {s.n} müşteri</s-text>
              {s.stok != null && s.stok <= 0 ? <s-badge tone="critical">Stok yok</s-badge> : null}
            </s-stack>
          ))}
        </s-stack>

        <s-link href={panelLink}>Bildirim Merkezi'nde aç →</s-link>
      </s-stack>
    </s-admin-block>
  );
}
