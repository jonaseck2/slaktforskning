import java.sql.*;
import java.util.*;

/**
 * Standalone Derby extractor. Dumps Genney schema tables to stdout as NDJSON.
 * One JSON line per table: {"table":"PERSON","rows":[...]}
 *
 * Usage:
 *   java -cp '.:/jars/*' DerbyExtractor --db-path /path/to/derby --schema LINDA_AHNSTEDT
 *   java -cp '.:/jars/*' DerbyExtractor --db-path /path/to/derby --list-schemas
 */
public class DerbyExtractor {

    static final String[] TABLES = {
        "PERSON", "FAMILY", "COUPLE_FAMILY", "SPOUSE_FAMILY",
        "EVENT", "EVENT_PLACE", "SPLACE", "SOURCE",
        "CITATION", "CITATION_SOURCE", "OWNER_CITATION", "REMARK"
    };

    public static void main(String[] args) throws Exception {
        String dbPath = null;
        String schema = null;
        boolean listSchemas = false;

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--db-path":   if (i + 1 < args.length) dbPath = args[++i]; break;
                case "--schema":    if (i + 1 < args.length) schema = args[++i]; break;
                case "--list-schemas": listSchemas = true; break;
            }
        }

        if (dbPath == null) {
            System.err.println("Usage: DerbyExtractor --db-path <path> [--schema <schema>|--list-schemas]");
            System.exit(1);
        }

        // Force Derby system home to /tmp to avoid writing derby.log in the DB dir
        System.setProperty("derby.system.home", "/tmp");

        Class.forName("org.apache.derby.jdbc.EmbeddedDriver");
        String url = "jdbc:derby:" + dbPath + ";readOnly=true";

        try (Connection conn = DriverManager.getConnection(url)) {
            if (listSchemas) {
                DatabaseMetaData meta = conn.getMetaData();
                ResultSet rs = meta.getSchemas();
                while (rs.next()) {
                    String sname = rs.getString("TABLE_SCHEM");
                    if (!sname.startsWith("SYS") && !sname.equals("NULLID") && !sname.equals("SQLJ")) {
                        System.out.println(sname);
                    }
                }
                return;
            }

            if (schema == null) {
                System.err.println("--schema is required (or use --list-schemas)");
                System.exit(1);
            }

            for (String table : TABLES) {
                exportTable(conn, schema, table);
            }
        }
    }

    static void exportTable(Connection conn, String schema, String table) {
        String sql = "SELECT * FROM \"" + schema + "\".\"" + table + "\"";
        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            ResultSetMetaData meta = rs.getMetaData();
            int cols = meta.getColumnCount();
            String[] colNames = new String[cols];
            for (int i = 0; i < cols; i++) {
                colNames[i] = meta.getColumnName(i + 1);
            }

            StringBuilder sb = new StringBuilder();
            sb.append("{\"table\":\"").append(jsonStr(table)).append("\",\"rows\":[");
            boolean firstRow = true;
            while (rs.next()) {
                if (!firstRow) sb.append(",");
                firstRow = false;
                sb.append("{");
                for (int i = 0; i < cols; i++) {
                    if (i > 0) sb.append(",");
                    sb.append("\"").append(colNames[i]).append("\":");
                    Object val = rs.getObject(i + 1);
                    sb.append(jsonVal(val));
                }
                sb.append("}");
            }
            sb.append("]}");
            System.out.println(sb);

        } catch (SQLException e) {
            System.err.println("Warning: skipping " + schema + "." + table + ": " + e.getMessage());
            System.out.println("{\"table\":\"" + table + "\",\"rows\":[]}");
        }
    }

    static String jsonVal(Object val) {
        if (val == null) return "null";
        if (val instanceof Number) return val.toString();
        if (val instanceof Boolean) return val.toString();
        return "\"" + jsonStr(val.toString()) + "\"";
    }

    static String jsonStr(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }
}
