import java.sql.*;
import java.util.*;

/**
 * Standalone Derby extractor. Dumps Genney schema tables to stdout as NDJSON.
 * One JSON line per table: {"table":"PERSON","rows":[...]}
 *
 * Usage:
 *   java -cp '.:/jars/*' DerbyExtractor --db-path /path/to/derby --schema LINDA_AHNSTEDT
 *   java -cp '.:/jars/*' DerbyExtractor --db-path /path/to/derby --list-schemas
 *   java -cp '.:/jars/*' DerbyExtractor --db-path /path/to/derby --schema LINDA_AHNSTEDT --list-tables
 */
public class DerbyExtractor {

    public static void main(String[] args) throws Exception {
        String dbPath = null;
        String schema = null;
        boolean listSchemas = false;
        boolean listTables = false;

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--db-path":    if (i + 1 < args.length) dbPath = args[++i]; break;
                case "--schema":     if (i + 1 < args.length) schema = args[++i]; break;
                case "--list-schemas": listSchemas = true; break;
                case "--list-tables":  listTables = true; break;
            }
        }

        if (dbPath == null) {
            System.err.println("Usage: DerbyExtractor --db-path <path> [--schema <schema>|--list-schemas]");
            System.exit(1);
        }

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

            // Discover all user tables in this schema
            List<String> allTables = new ArrayList<>();
            DatabaseMetaData meta = conn.getMetaData();
            ResultSet rs = meta.getTables(null, schema.toUpperCase(), "%", new String[]{"TABLE"});
            while (rs.next()) {
                allTables.add(rs.getString("TABLE_NAME"));
            }
            rs.close();

            if (listTables) {
                // Emit one JSON object with table names + column names + row counts
                // {"table":"__DISCOVERY__","rows":[{"name":"PERSON","columns":["RID",...],"rowCount":123},...]}
                StringBuilder sb = new StringBuilder();
                sb.append("{\"table\":\"__DISCOVERY__\",\"rows\":[");
                boolean first = true;
                for (String tname : allTables) {
                    if (!first) sb.append(",");
                    first = false;
                    sb.append("{\"name\":\"").append(jsonStr(tname)).append("\"");

                    // Column names
                    sb.append(",\"columns\":[");
                    ResultSet cols = meta.getColumns(null, schema.toUpperCase(), tname, "%");
                    boolean firstCol = true;
                    while (cols.next()) {
                        if (!firstCol) sb.append(",");
                        firstCol = false;
                        sb.append("\"").append(jsonStr(cols.getString("COLUMN_NAME"))).append("\"");
                    }
                    cols.close();
                    sb.append("]");

                    // Row count
                    long count = 0;
                    try (Statement stmt = conn.createStatement();
                         ResultSet countRs = stmt.executeQuery(
                             "SELECT COUNT(*) FROM \"" + schema + "\".\"" + tname + "\"")) {
                        if (countRs.next()) count = countRs.getLong(1);
                    } catch (SQLException e) { /* leave 0 */ }
                    sb.append(",\"rowCount\":").append(count);

                    sb.append("}");
                }
                sb.append("]}");
                System.out.println(sb);
                return;
            }

            // Full export: dump every user table
            for (String tname : allTables) {
                exportTable(conn, schema, tname);
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
