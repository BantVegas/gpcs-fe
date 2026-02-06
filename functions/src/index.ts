import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import fetch from "node-fetch";
import OpenAI from "openai";

admin.initializeApp();

// OpenAI will be initialized lazily when needed
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

interface CompanyData {
  ico: string;
  name: string;
  dic?: string;
  icdph?: string;
  street?: string;
  city?: string;
  zip?: string;
  country?: string;
}

export const lookupICO = functions
  .region("europe-west1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Musíte byť prihlásený"
      );
    }

    const ico = String(data.ico || "").replace(/\s/g, "").padStart(8, "0");
    console.log(`Looking up ICO: ${ico}`);
    
    if (!/^\d{8}$/.test(ico)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "IČO musí mať 8 číslic"
      );
    }

    // 1) Check Firestore cache first
    try {
      const cacheDoc = await admin.firestore().collection("companies").doc(ico).get();
      if (cacheDoc.exists) {
        console.log(`Found in cache: ${ico}`);
        return { success: true, data: cacheDoc.data(), source: "cache" };
      }
      console.log(`Not in cache: ${ico}`);
    } catch (e) {
      console.warn("Cache lookup failed:", e);
    }

    // 2) Try RPO (Register právnických osôb)
    let companyData: CompanyData | null = null;
    
    try {
      console.log(`Trying RPO for: ${ico}`);
      const rpoResponse = await fetch(
        `https://rpo.statistics.sk/rpo/json/search?ico=${ico}`,
        { headers: { "Accept": "application/json" } }
      );
      
      console.log(`RPO response status: ${rpoResponse.status}`);
      
      if (rpoResponse.ok) {
        const rpoText = await rpoResponse.text();
        console.log(`RPO response: ${rpoText.substring(0, 500)}`);
        
        try {
          const rpoData = JSON.parse(rpoText) as any;
          if (rpoData?.results?.length > 0) {
            const result = rpoData.results[0];
            companyData = {
              ico,
              name: result.full_name || result.name || "",
              dic: result.dic || "",
              street: result.street || "",
              city: result.municipality || "",
              zip: result.postal_code || "",
              country: "Slovensko",
            };
            console.log(`RPO found: ${companyData.name}`);
          }
        } catch (parseErr) {
          console.warn("RPO JSON parse failed:", parseErr);
        }
      }
    } catch (e) {
      console.warn("RPO lookup failed:", e);
    }

    // 3) Try FinStat as fallback
    if (!companyData) {
      try {
        console.log(`Trying FinStat for: ${ico}`);
        const finstatResponse = await fetch(
          `https://www.finstat.sk/api/detail?ico=${ico}`,
          { headers: { "Accept": "application/json" } }
        );
        
        console.log(`FinStat response status: ${finstatResponse.status}`);
        
        if (finstatResponse.ok) {
          const finText = await finstatResponse.text();
          console.log(`FinStat response: ${finText.substring(0, 500)}`);
          
          try {
            const finData = JSON.parse(finText) as any;
            if (finData?.Name) {
              companyData = {
                ico,
                name: finData.Name || "",
                dic: finData.Dic || "",
                icdph: finData.IcDph || "",
                street: finData.Street || "",
                city: finData.City || "",
                zip: finData.ZipCode || "",
                country: "Slovensko",
              };
              console.log(`FinStat found: ${companyData.name}`);
            }
          } catch (parseErr) {
            console.warn("FinStat JSON parse failed:", parseErr);
          }
        }
      } catch (e) {
        console.warn("FinStat lookup failed:", e);
      }
    }

    // 4) Try data.gov.sk API (Slovak open data)
    if (!companyData) {
      try {
        console.log(`Trying data.gov.sk for: ${ico}`);
        const dataGovResponse = await fetch(
          `https://data.gov.sk/api/action/datastore_search?resource_id=25a26a45-a1d8-4f0a-a5b1-8e0c3e0c9e0a&q=${ico}`,
          { headers: { "Accept": "application/json" } }
        );
        
        console.log(`data.gov.sk response status: ${dataGovResponse.status}`);
        
        if (dataGovResponse.ok) {
          const dataGovData = await dataGovResponse.json() as any;
          if (dataGovData?.result?.records?.length > 0) {
            const record = dataGovData.result.records[0];
            companyData = {
              ico,
              name: record.nazov || record.obchodne_meno || "",
              dic: record.dic || "",
              street: record.ulica || "",
              city: record.obec || record.mesto || "",
              zip: record.psc || "",
              country: "Slovensko",
            };
            console.log(`data.gov.sk found: ${companyData.name}`);
          }
        }
      } catch (e) {
        console.warn("data.gov.sk lookup failed:", e);
      }
    }

    // 5) Try ORSR as last resort
    if (!companyData) {
      try {
        console.log(`Trying ORSR for: ${ico}`);
        const orsrResponse = await fetch(
          `https://www.orsr.sk/hladaj_ico.asp?ICO=${ico}&SID=0`,
          { headers: { "Accept": "text/html" } }
        );
        
        console.log(`ORSR response status: ${orsrResponse.status}`);
        
        if (orsrResponse.ok) {
          const html = await orsrResponse.text();
          console.log(`ORSR HTML length: ${html.length}`);
          
          // Extract company name from link
          const nameMatch = html.match(/<a[^>]*vypis\.asp[^>]*>([^<]+)<\/a>/i);
          let name = nameMatch ? nameMatch[1].trim() : "";
          
          // Extract detail page URL to get more info
          const detailMatch = html.match(/href="(vypis\.asp\?[^"]+)"/i);
          
          if (name && detailMatch) {
            console.log(`ORSR found name: ${name}, fetching details...`);
            
            // Fetch detail page for address
            try {
              const detailResponse = await fetch(
                `https://www.orsr.sk/${detailMatch[1]}`,
                { headers: { "Accept": "text/html" } }
              );
              
              if (detailResponse.ok) {
                const detailHtml = await detailResponse.text();
                
                // Extract address - look for "Sídlo:" section
                const addressMatch = detailHtml.match(/S[ií]dlo[^<]*<[^>]*>[^<]*<[^>]*>([^<]+)/i);
                let address = addressMatch ? addressMatch[1].trim() : "";
                
                // Try to parse address into components
                let street = "";
                let city = "";
                let zip = "";
                
                if (address) {
                  // Slovak address format: "Street 123, 12345 City"
                  const zipCityMatch = address.match(/(\d{3}\s?\d{2})\s+(.+)/);
                  if (zipCityMatch) {
                    zip = zipCityMatch[1].replace(/\s/g, "");
                    city = zipCityMatch[2].trim();
                    street = address.replace(zipCityMatch[0], "").replace(/,\s*$/, "").trim();
                  } else {
                    const parts = address.split(",").map(s => s.trim());
                    if (parts.length >= 2) {
                      street = parts[0];
                      city = parts[parts.length - 1];
                    }
                  }
                }
                
                // Extract IČO DPH if present
                const icdphMatch = detailHtml.match(/I[ČC]O?\s*DPH[^<]*<[^>]*>([^<]+)/i);
                const icdph = icdphMatch ? icdphMatch[1].trim() : "";
                
                companyData = {
                  ico,
                  name,
                  icdph,
                  street,
                  city,
                  zip,
                  country: "Slovensko",
                };
                console.log(`ORSR detail found: ${JSON.stringify(companyData)}`);
              }
            } catch (detailErr) {
              console.warn("ORSR detail fetch failed:", detailErr);
              // Use just the name if detail fetch fails
              companyData = {
                ico,
                name,
                country: "Slovensko",
              };
            }
          } else if (name) {
            companyData = {
              ico,
              name,
              country: "Slovensko",
            };
            console.log(`ORSR found (name only): ${companyData.name}`);
          } else {
            console.log("ORSR: No name found in HTML");
          }
        }
      } catch (e) {
        console.warn("ORSR lookup failed:", e);
      }
    }

    if (companyData) {
      console.log(`Saving to cache: ${ico} - ${companyData.name}`);
      await admin.firestore().collection("companies").doc(ico).set(companyData, { merge: true });
      return { success: true, data: companyData, source: "api" };
    }

    console.log(`Company not found: ${ico}`);
    return { success: false, message: "Firma sa nenašla" };
  });

// Extract invoice data from uploaded file using OpenAI
export const extractInvoice = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený");
    }

    const { uploadId, companyId } = data;
    if (!uploadId || !companyId) {
      throw new functions.https.HttpsError("invalid-argument", "Chýba uploadId alebo companyId");
    }

    console.log(`Extracting invoice from upload: ${uploadId}`);

    // Get upload document
    const uploadDoc = await admin.firestore()
      .collection("companies").doc(companyId)
      .collection("uploads").doc(uploadId)
      .get();

    if (!uploadDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Upload neexistuje");
    }

    const uploadData = uploadDoc.data()!;
    const { storagePath, downloadUrl, mime } = uploadData;

    // Update status to processing
    await uploadDoc.ref.update({ status: "PROCESSING", updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    try {
      let textContent = "";
      
      // For images, use OpenAI Vision
      if (mime?.startsWith("image/")) {
        console.log("Processing image with OpenAI Vision...");
        const response = await getOpenAI().chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyzuj túto faktúru a extrahuj všetky údaje. Vráť JSON objekt s týmito poľami:
{
  "invoiceType": "RECEIVED alebo ISSUED - RECEIVED ak je to faktúra ktorú niekto vystavil pre nás (my platíme), ISSUED ak sme ju vystavili my (niekto platí nám)",
  "invoiceNumber": "číslo faktúry",
  "issueDate": "dátum vystavenia vo formáte YYYY-MM-DD",
  "dueDate": "dátum splatnosti vo formáte YYYY-MM-DD",
  "supplier": {
    "name": "názov dodávateľa/odberateľa",
    "ico": "IČO (8 číslic)",
    "dic": "DIČ",
    "icdph": "IČ DPH",
    "street": "ulica a číslo",
    "city": "mesto",
    "zip": "PSČ"
  },
  "items": [{"description": "popis položky", "quantity": 1, "unitPrice": 100, "total": 100}],
  "subtotal": suma bez DPH,
  "vat": suma DPH,
  "total": celková suma s DPH,
  "currency": "EUR",
  "variableSymbol": "variabilný symbol",
  "iban": "IBAN účet"
}
DÔLEŽITÉ: Ak faktúru vystavila iná firma pre nás (my sme odberateľ), je to RECEIVED (prijatá faktúra = výdavok).
Ak sme faktúru vystavili my pre niekoho iného, je to ISSUED (vydaná faktúra = príjem).
Vráť IBA JSON, žiadny iný text.`
                },
                {
                  type: "image_url",
                  image_url: { url: downloadUrl }
                }
              ]
            }
          ],
          max_tokens: 2000,
        });
        textContent = response.choices[0]?.message?.content || "";
      } else if (mime === "application/pdf") {
        // For PDFs, download and extract text first
        console.log("Processing PDF...");
        const bucket = admin.storage().bucket("gpcs-ucty.firebasestorage.app");
        const file = bucket.file(storagePath);
        const [fileBuffer] = await file.download();
        
        // Use pdf-parse to extract text
        const pdfParse = require("pdf-parse");
        const pdfData = await pdfParse(fileBuffer);
        const pdfText = pdfData.text;
        
        console.log(`PDF text extracted, length: ${pdfText.length}`);
        
        // Use OpenAI to parse the text
        const response = await getOpenAI().chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: `Analyzuj tento text z faktúry a extrahuj všetky údaje. Vráť JSON objekt s týmito poľami:
{
  "invoiceType": "RECEIVED alebo ISSUED - RECEIVED ak je to faktúra ktorú niekto vystavil pre nás (my platíme), ISSUED ak sme ju vystavili my (niekto platí nám)",
  "invoiceNumber": "číslo faktúry",
  "issueDate": "dátum vystavenia vo formáte YYYY-MM-DD",
  "dueDate": "dátum splatnosti vo formáte YYYY-MM-DD",
  "supplier": {
    "name": "názov dodávateľa/odberateľa",
    "ico": "IČO (8 číslic)",
    "dic": "DIČ",
    "icdph": "IČ DPH",
    "street": "ulica a číslo",
    "city": "mesto",
    "zip": "PSČ"
  },
  "items": [{"description": "popis položky", "quantity": 1, "unitPrice": 100, "total": 100}],
  "subtotal": suma bez DPH,
  "vat": suma DPH,
  "total": celková suma s DPH,
  "currency": "EUR",
  "variableSymbol": "variabilný symbol",
  "iban": "IBAN účet"
}
DÔLEŽITÉ: Ak faktúru vystavila iná firma pre nás (my sme odberateľ), je to RECEIVED (prijatá faktúra = výdavok).
Ak sme faktúru vystavili my pre niekoho iného, je to ISSUED (vydaná faktúra = príjem).
Vráť IBA JSON, žiadny iný text.

Text faktúry:
${pdfText.substring(0, 8000)}`
            }
          ],
          max_tokens: 2000,
        });
        textContent = response.choices[0]?.message?.content || "";
      } else {
        throw new functions.https.HttpsError("invalid-argument", "Nepodporovaný typ súboru");
      }

      // Parse JSON from response
      console.log("OpenAI response:", textContent.substring(0, 500));
      
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = textContent;
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      
      const extractedData = JSON.parse(jsonStr.trim());
      console.log("Extracted data:", JSON.stringify(extractedData));

      // Update upload with extracted data
      await uploadDoc.ref.update({
        status: "EXTRACTED",
        extractedData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, data: extractedData };
    } catch (error: any) {
      console.error("Extraction failed:", error);
      await uploadDoc.ref.update({
        status: "ERROR",
        error: error.message || "Extrakcia zlyhala",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new functions.https.HttpsError("internal", error.message || "Extrakcia zlyhala");
    }
  });

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  priority?: "high" | "normal";
}

// Send push notification to a specific user
export const sendPushNotification = functions
  .region("europe-west1")
  .https.onCall(async (data: { companyId: string; userId: string; notification: NotificationPayload }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený");
    }

    const { companyId, userId, notification } = data;

    // Get user's FCM token
    const tokenDoc = await admin.firestore()
      .collection("companies")
      .doc(companyId)
      .collection("fcmTokens")
      .doc(userId)
      .get();

    if (!tokenDoc.exists) {
      console.log(`No FCM token for user ${userId}`);
      return { success: false, reason: "no_token" };
    }

    const tokenData = tokenDoc.data();
    const fcmToken = tokenData?.token;

    if (!fcmToken) {
      return { success: false, reason: "no_token" };
    }

    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          url: notification.url || "/",
          tag: notification.tag || "gpcs-notification",
          priority: notification.priority || "normal",
        },
        webpush: {
          notification: {
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-72x72.png",
            vibrate: [200, 100, 200],
          },
          fcmOptions: {
            link: notification.url || "/",
          },
        },
      });

      console.log(`Push notification sent to user ${userId}`);
      return { success: true };
    } catch (error: any) {
      console.error("Failed to send push notification:", error);
      
      // If token is invalid, remove it
      if (error.code === "messaging/invalid-registration-token" ||
          error.code === "messaging/registration-token-not-registered") {
        await tokenDoc.ref.delete();
      }
      
      return { success: false, reason: error.message };
    }
  });

// Send push notification to all users in a company
export const sendCompanyNotification = functions
  .region("europe-west1")
  .https.onCall(async (data: { companyId: string; notification: NotificationPayload }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený");
    }

    const { companyId, notification } = data;

    // Get all FCM tokens for the company
    const tokensSnap = await admin.firestore()
      .collection("companies")
      .doc(companyId)
      .collection("fcmTokens")
      .get();

    if (tokensSnap.empty) {
      return { success: false, sent: 0, reason: "no_tokens" };
    }

    const tokens = tokensSnap.docs
      .map(d => d.data()?.token)
      .filter(Boolean) as string[];

    if (tokens.length === 0) {
      return { success: false, sent: 0, reason: "no_tokens" };
    }

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          url: notification.url || "/",
          tag: notification.tag || "gpcs-notification",
          priority: notification.priority || "normal",
        },
        webpush: {
          notification: {
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-72x72.png",
          },
        },
      });

      console.log(`Push notifications sent: ${response.successCount} success, ${response.failureCount} failed`);
      return { success: true, sent: response.successCount, failed: response.failureCount };
    } catch (error: any) {
      console.error("Failed to send company notifications:", error);
      return { success: false, sent: 0, reason: error.message };
    }
  });

// Scheduled function to check for due tasks and send reminders
export const checkDueTasksAndNotify = functions
  .region("europe-west1")
  .pubsub.schedule("0 8 * * *") // Every day at 8:00 AM
  .timeZone("Europe/Bratislava")
  .onRun(async () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all companies
    const companiesSnap = await admin.firestore().collection("companies").get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      // Get tasks due today or tomorrow
      const tasksSnap = await admin.firestore()
        .collection("companies")
        .doc(companyId)
        .collection("tasks")
        .where("status", "!=", "COMPLETED")
        .get();

      const dueTasks = tasksSnap.docs.filter(d => {
        const task = d.data();
        const dueDate = task.dueDate?.toDate?.() || new Date(task.dueDate);
        return dueDate <= tomorrow;
      });

      if (dueTasks.length === 0) continue;

      // Get all FCM tokens for this company
      const tokensSnap = await admin.firestore()
        .collection("companies")
        .doc(companyId)
        .collection("fcmTokens")
        .get();

      const tokens = tokensSnap.docs
        .map(d => d.data()?.token)
        .filter(Boolean) as string[];

      if (tokens.length === 0) continue;

      // Send notification about due tasks
      const overdueCount = dueTasks.filter(d => {
        const dueDate = d.data().dueDate?.toDate?.() || new Date(d.data().dueDate);
        return dueDate < now;
      }).length;

      const notification = {
        title: overdueCount > 0 
          ? `⚠️ ${overdueCount} úloh po termíne!`
          : `📋 ${dueTasks.length} úloh s blížiacim sa termínom`,
        body: dueTasks.slice(0, 3).map(d => d.data().title).join(", "),
      };

      try {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification,
          data: {
            url: "/accounting/tasks",
            tag: "task-reminder",
            priority: overdueCount > 0 ? "high" : "normal",
          },
          webpush: {
            notification: {
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-72x72.png",
              vibrate: [200, 100, 200],
            },
          },
        });
        console.log(`Task reminders sent to company ${companyId}`);
      } catch (error) {
        console.error(`Failed to send task reminders to company ${companyId}:`, error);
      }
    }

    return null;
  });

// Trigger notification when invoice is overdue
export const onInvoiceOverdue = functions
  .region("europe-west1")
  .pubsub.schedule("0 9 * * *") // Every day at 9:00 AM
  .timeZone("Europe/Bratislava")
  .onRun(async () => {
    const now = new Date();

    const companiesSnap = await admin.firestore().collection("companies").get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      // Get unpaid entries (invoices)
      const entriesSnap = await admin.firestore()
        .collection("companies")
        .doc(companyId)
        .collection("entries")
        .where("payment.status", "!=", "PAID")
        .get();

      const overdueEntries = entriesSnap.docs.filter(d => {
        const entry = d.data();
        const dueDate = entry.payment?.dueDate?.toDate?.() || entry.dueDate?.toDate?.();
        return dueDate && dueDate < now;
      });

      if (overdueEntries.length === 0) continue;

      // Get FCM tokens
      const tokensSnap = await admin.firestore()
        .collection("companies")
        .doc(companyId)
        .collection("fcmTokens")
        .get();

      const tokens = tokensSnap.docs
        .map(d => d.data()?.token)
        .filter(Boolean) as string[];

      if (tokens.length === 0) continue;

      const totalOverdue = overdueEntries.reduce((sum, d) => sum + (d.data().amount || 0), 0);

      try {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: `💰 ${overdueEntries.length} faktúr po splatnosti`,
            body: `Celková suma: ${totalOverdue.toFixed(2)} €`,
          },
          data: {
            url: "/income",
            tag: "invoice-overdue",
            priority: "high",
          },
          webpush: {
            notification: {
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-72x72.png",
              vibrate: [200, 100, 200],
            },
          },
        });
        console.log(`Overdue invoice reminders sent to company ${companyId}`);
      } catch (error) {
        console.error(`Failed to send overdue reminders to company ${companyId}:`, error);
      }
    }

    return null;
  });
