import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'YOUR_SUPABASE_URL',
  'YOUR_SUPABASE_ANON_KEY'
);

const urlParams = new URLSearchParams(window.location.search);
const productSlug = urlParams.get('product_slug');
const affiliateId = urlParams.get('affiliate_id');  // optional

async function loadProduct() {
  if (!productSlug) return alert('No product specified');

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('slug', productSlug)
    .single();

  if (!product) return alert('Product not found');

  document.getElementById('product-title').innerText = product.name;
  document.getElementById('product-name').innerText = product.name;
  document.getElementById('product-description').innerText = product.description;
  document.getElementById('product-price').innerText = `$${product.price.toFixed(2)}`;
  document.getElementById('product-image').src = product.cover_image;

  document.getElementById('buy-button').addEventListener('click', () => {
    const payload = {
      product_slug: product.slug,
      affiliate_id: affiliateId || null
    };
    window.location.href = `/checkout?product_slug=${product.slug}&affiliate_id=${affiliateId || ''}`;
  });
}

loadProduct();
