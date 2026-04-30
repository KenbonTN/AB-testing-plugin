# A/B Testing Plugin - User Guide

**Purpose:** Help users successfully set up and use the plugin on Framer, reducing support tickets and ensuring smooth onboarding.

---

## 📖 Quick Overview

The A/B Testing Plugin for Framer enables you to track conversion events for A/B testing experiments directly within your Framer projects. It seamlessly integrates with your A/B testing backend to record user interactions and variant assignments.

---

## 🎯 User Journey: Three Main Phases

### Phase 1: Discovery
**What:** You find the plugin on the Framer marketplace  
**Timeline:** Browsing Framer plugins  
**Expected Outcome:** Plugin is added to your Framer project library

**Steps:**
1. Navigate to Framer Marketplace
2. Search for "A/B Testing Plugin"
3. Click "Add to Project" or "Install"
4. Plugin appears in your component library

---

### Phase 2: Activation
**What:** You configure the plugin with your experiment credentials  
**Timeline:** First 5-10 minutes after installation  
**Expected Outcome:** Plugin is ready to track conversions

#### Required Information

You'll need these credentials from your A/B testing dashboard:

| Field | Description | Example |
|-------|-------------|---------|
| **Experiment ID** | Unique identifier for your A/B test | `3a9fe711-74ec-4d14-910b-666214557e54` |
| **Write Key** | API key to authenticate event tracking | `c166d76d-8320-4f93-a035-ee92be66751c` |
| **API URL** | Backend endpoint for event tracking | `https://ab-testing-worker.kenbonfloziio.workers.dev` |

#### Optional Configuration

| Field | Description | Default |
|-------|-------------|---------|
| **Event Name** | Label for the conversion event | `conversion` |
| **Trigger On** | When to track the conversion | `click` |
| **Respect Consent** | Enable GDPR/privacy compliance | `false` |
| **Consent Cookie Name** | Cookie name to check for user consent | `cookie_consent` |

#### Setup Instructions

1. **Add the plugin to your frame**
   - In Framer, search for "A/B Testing Trigger" in components
   - Drag it onto your canvas
   - Wrap the element you want to track (button, form, etc.)

2. **Configure credentials**
   - Go to the component's property panel
   - Paste your **Experiment ID**
   - Paste your **Write Key**
   - Keep API URL as default (or customize if self-hosting)

3. **Set trigger behavior**
   - Choose how you want to track conversions:
     - **Click** - Tracks when user clicks the element
     - **Mount** - Tracks when the element loads
     - **Visible** - Tracks when element scrolls into view
     - **Submit** - Tracks when a form is submitted

4. **Enable consent (optional)**
   - If you need GDPR compliance, enable "Respect Consent"
   - Specify the cookie name your consent banner uses
   - Plugin will only track if consent cookie is set to `true`, `accepted`, or `1`

---

### Phase 3: Project Handshake
**What:** Plugin connects to your backend and starts recording events  
**Timeline:** Immediately after activation, ongoing  
**Expected Outcome:** Conversion events are being recorded in real-time

#### How It Works Behind the Scenes

When a conversion is triggered:

1. **Plugin checks variant assignment** - Reads the `ab_[experimentId]` cookie to determine if user is in variant A or B
2. **Gets visitor ID** - Retrieves or uses the stored visitor ID from localStorage
3. **Sends event** - Posts conversion data to your API endpoint with authentication
4. **Respects consent** - If enabled, verifies consent before sending any data

#### Example Data Sent

```json
{
  "experiment_id": "3a9fe711-74ec-4d14-910b-666214557e54",
  "type": "conversion",
  "variant": "A",
  "visitor_id": "user-12345"
}
```

---

## 🔑 Where to Get Your Credentials

1. **Log in to your A/B Testing Dashboard**
2. **Select your experiment**
3. **Look for "Integration" or "API Keys" section**
4. **Copy:**
   - Experiment ID (UUID format)
   - Write Key (authentication token)
5. **Use default API URL** (unless you're self-hosting)

**Can't find these?** Contact your dashboard provider or check their documentation.

---

## 🚀 Testing Your Setup

### Before Going Live

1. **Verify variant assignment**
   - Check that you're in variant A or B (check cookies in DevTools)
   - Device -> Console -> `document.cookie`

2. **Test the trigger**
   - Perform the action (click, submit, etc.)
   - Open browser DevTools (F12)
   - Go to Network tab
   - Look for a POST request to `/v1/events`
   - Should see `200 OK` response

3. **Check the backend**
   - Log into your dashboard
   - Navigate to your experiment
   - You should see a new conversion event recorded


## 📊 Monitoring & Best Practices

### Do's ✅
- ✅ Test in a development environment first
- ✅ Keep your Write Key secret (don't commit to version control)
- ✅ Use meaningful Event Names (e.g., "cta_click" vs "click")
- ✅ Enable consent tracking if required by law
- ✅ Monitor your conversion rates regularly

### Don'ts ❌
- ❌ Reuse the same experiment ID across different variants
- ❌ Share your Write Key publicly
- ❌ Track conversions without proper consent
- ❌ Change API URL mid-experiment (breaks tracking continuity)
- ❌ Wrap multiple independent elements with one component

---

## 🆘 Troubleshooting

### Question: Do I need to pay to use this plugin?

**Answer:** Depends on your setup:
- **Using default API (kenbonfloziio.workers.dev):** Free tier available; check backend documentation for usage limits
- **Self-hosted backend:** Only pay for your own infrastructure (server, database, etc.)
- **Framer marketplace:** May have separate plugin pricing if publisher charges

### Question: Can I track multiple events per user?

**Answer:** Yes. Each element wrapped with the plugin can track different event types (conversion, signup, purchase, etc.) using the `Event Name` property.

### Question: What if I want to use a custom API endpoint?

**Answer:** 
1. Change the **API URL** field to your endpoint
2. Ensure your endpoint has the `/v1/events` route
3. Your endpoint must accept the event payload format shown above
4. Verify authentication tokens match your system

### Question: How are visitor IDs tracked?

**Answer:** 
- Stored in `localStorage` as `ab-user-[experimentId]`
- Should be generated by your experiment assignment service
- If not found, sends `null` (your backend should handle this)

### Question: Can I pause tracking without removing the component?

**Answer:** 
Yes, by disabling consent:
- Set **Respect Consent** to ON
- Remove/clear the consent cookie
- Plugin won't send events until consent is re-added

---

## 📞 Support Resources

**Still have questions?**
- Check the FAQ section above
- Review the Technical Documentation (for developers)
- Contact your A/B Testing provider's support team

**Found a bug?**
- Document the exact steps to reproduce
- Include your Experiment ID (without your Write Key)
- Note your browser and Framer version
- Report to the plugin publisher

---

## 🔄 Updates & Maintenance

The plugin receives updates automatically. If you notice new features or changes:
- Check Framer's changelog
- Review the "What's New" section in your component settings
- No action needed on your part—updates apply automatically

**Version:** 1.0.0  
**Last Updated:** 2026-04-07  
**Status:** Production Ready
