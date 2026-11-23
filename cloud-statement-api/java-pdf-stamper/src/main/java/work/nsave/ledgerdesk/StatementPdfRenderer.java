package work.nsave.ledgerdesk;

import com.fasterxml.jackson.databind.JsonNode;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.PdfStamper;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class StatementPdfRenderer {
    private static final float PAGE_W = 612f, PAGE_H = 792f;
    private static final float MR = .47f, MG = .45f, MB = .43f;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private final byte[] template;
    private final BaseFont regular;

    public StatementPdfRenderer() throws Exception {
        template = resource("/template/nsave-statement-template.pdf");
        regular = BaseFont.createFont("Inter-Regular.ttf", BaseFont.IDENTITY_H, BaseFont.EMBEDDED,
                true, resource("/fonts/Inter-Regular.ttf"), null);
    }

    public byte[] render(JsonNode s) throws Exception {
        validate(s);
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfReader reader = new PdfReader(template);
            PdfStamper stamper = new PdfStamper(reader, out);
            try {
                int perPage = 4, count = s.path("transactions").size();
                int pages = Math.max(1, (int)Math.ceil(count / (double)perPage));
                while (reader.getNumberOfPages() < pages) {
                    int page = reader.getNumberOfPages() + 1;
                    stamper.insertPage(page, new Rectangle(PAGE_W, PAGE_H));
                    stamper.getUnderContent(page).addTemplate(stamper.getImportedPage(reader, 1), 0, 0);
                }
                for (int page = 1; page <= pages; page++) {
                    PdfContentByte c = stamper.getOverContent(page);
                    mask(c, page == 1);
                    if (page == 1) stampProfile(c, s); else stampContinuation(c, s);
                    stampTransactions(c, s.path("transactions"), page, perPage, s.path("currency").asText());
                }
            } finally {
                stamper.close();
                reader.close();
            }
            return out.toByteArray();
        }
    }

    private void mask(PdfContentByte c, boolean first) {
        white(c, 13, 115, 250, 23);
        white(c, 151, 148, 230, 20);
        white(c, 151, 168, 245, 48);
        white(c, 151, 228, 230, 20);
        white(c, 151, 248, 370, 20);
        white(c, 151, 268, 205, 20);
        white(c, 151, 288, 205, 20);
        white(c, 505, 268, 90, 82);
        white(c, 13, 385, 220, 22);
        if (!first) white(c, 12, 145, 580, 220);
    }

    private void stampProfile(PdfContentByte c, JsonNode s) throws Exception {
        draw(c, semibold, "Account Statement " + s.path("currency").asText(), 20.6f, 15.3f, 682.5f, 0, 0, 0);
        draw(c, regular, date(s.path("from").asText()) + " - " + date(s.path("to").asText()), 13.8f, 15.3f, 659.5f, MR, MG, MB);
        label(c, "Name", 15.3f, 629.5f); value(c, s.path("customerName").asText(), 158.1f, 629.5f, 10.3f, 205);
        label(c, "Address", 15.3f, 609.7f);
        List<String> lines = wrap(s.path("address").asText(), regular, 10.3f, 205);
        if (lines.size() > 3) throw new IllegalArgumentException("Customer address exceeds the template's three-line address area");
        for (int i=0;i<lines.size();i++) value(c, lines.get(i), 158.1f, 609.7f-i*12.9f, 10.3f, 205);
        label(c, "Bank", 15.3f, 541.5f); value(c, s.path("bankName").asText().toUpperCase(Locale.US), 158.1f, 541.5f, 10.3f, 225);
        label(c, "Bank Address", 15.3f, 521.7f); value(c, s.path("bankAddress").asText(), 158.1f, 521.7f, 10.3f, 360);
        label(c, "Account Number", 15.3f, 501.9f); value(c, s.path("accountNumber").asText(), 158.1f, 501.9f, 10.3f, 200);
        if (!s.path("routingNumber").asText().isBlank()) {
            label(c, "Routing Number", 15.3f, 482.1f); value(c, s.path("routingNumber").asText(), 158.1f, 482.1f, 10.3f, 200);
        }
        String[] labels={"Opening Balance","Closing Balance","Total Payments","Total Deposits"};
        String[] keys={"opening","closing","payments","deposits"};
        for(int i=0;i<labels.length;i++) value(c, money(s.path(keys[i]).asLong(),s.path("currency").asText()),
                509.5f,501.9f-i*19.8f,10.3f,80);
    }

    private void stampContinuation(PdfContentByte c, JsonNode s) throws Exception {
        draw(c, semibold, "Account Statement " + s.path("currency").asText() + " (continued)", 16f, 15.3f, 682.5f, 0, 0, 0);
        draw(c, regular, date(s.path("from").asText()) + " - " + date(s.path("to").asText()), 13f, 15.3f, 659.5f, MR, MG, MB);
        draw(c, regular, "Transactions continued", 10.3f, 15.3f, 630f, 0, 0, 0);
    }

    private void stampTransactions(PdfContentByte c, JsonNode txs, int page, int perPage, String currency) throws Exception {
        int from=(page-1)*perPage, to=Math.min(txs.size(),from+perPage);
        if(txs.isEmpty()){ value(c,"No rows to display.",15.3f,392.5f,10.3f,220); return; }
        for(int i=from;i<to;i++){
            JsonNode tx=txs.get(i); float y=392.5f-(i-from)*15f;
            value(c,date(tx.path("date").asText()),15.3f,y,8f,85);
            value(c,tx.path("description").asText(),118.1f,y,8f,270);
            right(c,money(tx.path("amount").asLong(),currency),409.8f,y,8f,70);
            String bal=tx.path("balance").isNull()?"—":money(tx.path("balance").asLong(),currency);
            right(c,bal,557.9f,y,8f,40);
        }
    }

    private void label(PdfContentByte c,String t,float x,float y){ draw(c,regular,t,10.3f,x,y,0,0,0); }
    private void value(PdfContentByte c,String t,float x,float y,float size,float width) throws Exception {
        float actual=size; while(actual>7 && regular.getWidthPoint(t,actual)>width) actual-=.25f;
        if(regular.getWidthPoint(t,actual)>width) throw new IllegalArgumentException("A statement field exceeds its template coordinate width");
        draw(c,regular,t,actual,x,y,MR,MG,MB);
    }
    private void right(PdfContentByte c,String t,float x,float y,float size,float width){
        draw(c,regular,t,size,x+width-regular.getWidthPoint(t,size),y,MR,MG,MB);
    }
    private void draw(PdfContentByte c,BaseFont f,String t,float size,float x,float y,float r,float g,float b){
        c.saveState(); c.setColorFill(new Color(r,g,b)); c.beginText(); c.setFontAndSize(f,size);
        c.setTextMatrix(x,y); c.showText(t); c.endText(); c.restoreState();
    }
    private void white(PdfContentByte c,float x,float top,float w,float h){
        c.saveState(); c.setColorFill(Color.WHITE); c.rectangle(x,PAGE_H-top-h,w,h); c.fill(); c.restoreState();
    }
    private static List<String> wrap(String value,BaseFont font,float size,float width){
        List<String> lines=new ArrayList<>(); StringBuilder line=new StringBuilder();
        for(String word:value.trim().split("\\s+")){
            String candidate=line.isEmpty()?word:line+" "+word;
            if(!line.isEmpty()&&font.getWidthPoint(candidate,size)>width){lines.add(line.toString());line=new StringBuilder(word);}
            else line=new StringBuilder(candidate);
        }
        if(!line.isEmpty())lines.add(line.toString()); return lines;
    }
    private static String date(String d){return LocalDate.parse(d).format(DATE);}
    private static String money(long cents,String currency){
        NumberFormat f=NumberFormat.getCurrencyInstance(Locale.US); f.setCurrency(java.util.Currency.getInstance(currency));
        f.setMinimumFractionDigits(2); f.setMaximumFractionDigits(2); return f.format(BigDecimal.valueOf(cents,2));
    }
    private static byte[] resource(String path)throws IOException{
        try(InputStream in=StatementPdfRenderer.class.getResourceAsStream(path)){
            if(in==null)throw new IOException("Missing PDF stamper resource "+path); return in.readAllBytes();
        }
    }
    private static void validate(JsonNode s){
        for(String k:new String[]{"requestReference","accountReference","customerName","address","bankName","bankAddress","accountNumber","currency","from","to"})
            if(s.path(k).asText().isBlank())throw new IllegalArgumentException("Missing statement field: "+k);
        if(!s.path("transactions").isArray())throw new IllegalArgumentException("transactions must be an array");
        for(String k:new String[]{"opening","closing","payments","deposits"})if(!s.path(k).isIntegralNumber())throw new IllegalArgumentException("Invalid monetary field: "+k);
        if(s.path("opening").asLong()+s.path("deposits").asLong()-s.path("payments").asLong()!=s.path("closing").asLong())
            throw new IllegalArgumentException("Statement totals do not reconcile");
        if(!"USD".equals(s.path("currency").asText()))throw new IllegalArgumentException("The approved nSave template supports USD statements only");
    }
}