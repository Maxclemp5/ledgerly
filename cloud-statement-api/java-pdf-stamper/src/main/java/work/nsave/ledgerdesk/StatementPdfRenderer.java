package work.nsave.ledgerdesk;

import com.fasterxml.jackson.databind.JsonNode;
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
    private static final float MR = .47f, MG = .45f, MB = .43f;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private final byte[] template;
    private final BaseFont regular;

    public StatementPdfRenderer() throws Exception {
        template = resource("/template/nsave-statement-template.pdf");
        regular = BaseFont.createFont("Inter-Regular.ttf", BaseFont.IDENTITY_H, BaseFont.EMBEDDED,
                true, resource("/fonts/Inter-Regular.ttf"), null);
    }

    public byte[] render(JsonNode statement) throws Exception {
        validate(statement);
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfReader reader = new PdfReader(template);
            try {
                PdfStamper stamper = new PdfStamper(reader, out);
                try {
                    PdfContentByte content = stamper.getOverContent(1);
                    stampProfile(content, statement);
                    stampTransactions(content, statement.path("transactions"), statement.path("currency").asText());
                } finally {
                    stamper.close();
                }
            } finally {
                reader.close();
            }
            return out.toByteArray();
        }
    }

    private void stampProfile(PdfContentByte c, JsonNode s) throws Exception {
        value(c, date(s.path("from").asText()) + " - " + date(s.path("to").asText()), 15.3f, 659.5f, 13.8f, 285f);
        value(c, s.path("customerName").asText(), 158.1f, 629.5f, 10.3f, 204f);

        List<String> lines = wrap(s.path("address").asText(), regular, 10.3f, 215f);
        if(lines.size() > 3) throw new IllegalArgumentException("Customer address exceeds the template's three-line area");
        for(int i = 0; i < lines.size(); i++)
            value(c, lines.get(i), 158.1f, 609.7f - i*12.9f, 10.3f, 215f);

        value(c, s.path("bankName").asText().toUpperCase(Locale.US), 158.1f, 541.5f, 10.3f, 225f);
        value(c, s.path("bankAddress").asText(), 158.1f, 521.7f, 10.3f, 357f);
        value(c, s.path("accountNumber").asText(), 158.1f, 501.9f, 10.3f, 206f);
        String routing = s.path("routingNumber").asText("");
        if(!routing.isBlank())
            value(c, routing, 158.1f, 482.1f, 10.3f, 206f);

        String[] fields = {"opening","closing","payments","deposits"};
        for(int i=0; i<fields.length; i++)
            value(c, money(s.path(fields[i]).asLong(),s.path("currency").asText()),
                    509.5f, 501.9f-i*19.8f, 10.3f, 80f);
    }

    private void stampTransactions(PdfContentByte c, JsonNode transactions, String currency) throws Exception {
        if(transactions.isEmpty()) {
            value(c, "No rows to display.", 15.3f, 392.5f, 10.3f, 250f);
            return;
        }
        if(transactions.size() > 4)
            throw new IllegalArgumentException("Transaction table exceeds the approved single-page template capacity");
        for(int i=0; i<transactions.size(); i++){
            JsonNode tx = transactions.get(i);
            float y = 392.5f - i*15f;
            value(c, date(tx.path("date").asText()), 15.3f, y, 8f, 86f);
            value(c, tx.path("description").asText(), 118.1f, y, 8f, 280f);
            right(c, money(tx.path("amount").asLong(), currency), 409.8f, y, 8f, 65f);
            String balance = tx.path("balance").isNull() ? "—" : money(tx.path("balance").asLong(), currency);
            right(c, balance, 557.9f, y, 8f, 39f);
        }
    }

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
    private static List<String> wrap(String value,BaseFont font,float size,float width){
        List<String> lines=new ArrayList<>(); StringBuilder line=new StringBuilder();
        for(String word:value.trim().split("\\s+")){
            String candidate=line.length()==0?word:line+" "+word;
            if(line.length()>0&&font.getWidthPoint(candidate,size)>width){lines.add(line.toString());line=new StringBuilder(word);}
            else line=new StringBuilder(candidate);
        }
        if(line.length()>0)lines.add(line.toString()); return lines;
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