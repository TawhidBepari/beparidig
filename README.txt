BEPARI DIG - Netlify-ready static site (final with PDF)
------------------------------------------------------
Files included (root):
- index.html
- product.html
- about.html
- contact.html
- terms.html
- privacy.html
- refund.html
- thankyou.html
- style.css
- /images/cover.png  (your cover image)
- /downloads/AI-Prompt.pdf  (your product PDF)

Next steps:
1) Deploy these files to Netlify (upload the folder contents or connect repo). Your Netlify site root should include index.html.
2) In Paddle, create a Hosted Checkout and set its Redirect URL to https://YOUR_NETLIFY_DOMAIN/thankyou.html
3) After checkout, Paddle will email buyers the secure download link. The thank-you page also includes a direct download button (convenience).
4) To replace the "Buy Now" placeholder, search for REPLACE_WITH_PADDLE_HOSTED_CHECKOUT_URL in index.html and product.html and paste your hosted checkout URL there.
5) If you want more secure delivery (webhook-based), I can prepare a webhook handler you can deploy later.

Note: The direct download link on thankyou.html is public—if you want absolute protection, switch to webhook delivery later.
