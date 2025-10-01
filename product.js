// product.js
const { createClient } = supabase = require('@supabase/supabase-js');

const supabase = createClient(
  'YOUR_SUPABASE_URL',       // replace with env variable in production
  'YOUR_SUPABASE_ANON_KEY'   // replace with env variable in production
);

// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
const affiliateLink = urlParams.get('affiliate_link');
const productSlug = urlParams.get('product_slug');

async function loadProduct() {
  let productId;
  let affiliateId = null;

  if (affiliateLink) {
    // Look up affiliate link
    const { data: linkData } = await supabase
      .from('affiliate_links')
      .select('product_id, affiliate_id')
      .eq('link_slug', affiliateLink)
      .single();
    if (!linkData) return alert('Invalid affiliate link');
    productId = linkData.product_id;
    affiliateId = linkData.affiliate_id;
  } else if (productSlug) {
    // Lookup product directly
    const { data: productData } = await supabase
      .from('products')
      .select('*')
      .eq('slug', productSlug)
      .single();
    if (!productData) return alert('Product not found');
    productId = productData.id;
  } else {
    return alert('No product specified');
  }

  // Get full product details
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (!product) return alert('Product not found');

  // Fill in HTML
  document.getElementById('product-title').innerText = product.name;
  document.getElementById('product-name').innerText = product.name;
  document.getElementById('product-description').innerText = product.description;
  document.getElementById('product-price').innerText = `$${product.price.toFixed(2)}`;
  document.getElementById('product-image').src = product.cover_image;

  // Setup Buy button
  document.getElementById('buy-button').addEventListener('click', () => {
    // Pass product_slug and affiliate_id to checkout webhook
    const payload = {
      product_slug: product.slug,
      affiliate_id: affiliateId
    };
    // Redirect to Dodo checkout page with this info (simplified example)
    window.location.href = `/checkout?product_slug=${product.slug}&affiliate_id=${affiliateId || ''}`;
  });
}

loadProduct();
