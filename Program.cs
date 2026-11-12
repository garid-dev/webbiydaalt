using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton(new FilterRepository(
    Path.Combine(builder.Environment.ContentRootPath, "App_Data", "watercare.db")));

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/companies", (FilterRepository repository) =>
    Results.Ok(repository.GetCompanies()));

app.MapGet("/api/dashboard", (string? company, FilterRepository repository) =>
    Results.Ok(repository.GetDashboard(company)));

app.MapGet("/api/filters", (string? search, string? company, FilterRepository repository) =>
    Results.Ok(repository.GetFilters(search, company)));

app.MapPost("/api/filters", (RegisterFilterRequest request, FilterRepository repository) =>
{
    if (string.IsNullOrWhiteSpace(request.AssetCode) ||
        string.IsNullOrWhiteSpace(request.Institution) ||
        string.IsNullOrWhiteSpace(request.Location) ||
        string.IsNullOrWhiteSpace(request.Model))
    {
        return Results.BadRequest(new { message = "Бүх талбарыг бөглөнө үү." });
    }

    if (!DateOnly.TryParseExact(request.InstallDate, "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var installDate))
    {
        return Results.BadRequest(new { message = "Суурилуулсан огноо буруу байна." });
    }

    if (request.IntervalMonths is < 1 or > 60)
    {
        return Results.BadRequest(new { message = "Солих давтамж 1-60 сарын хооронд байна." });
    }

    try
    {
        return Results.Created($"/api/filters", repository.Register(request, installDate));
    }
    catch (SqliteException exception) when (exception.SqliteErrorCode == 19)
    {
        return Results.Conflict(new { message = "Энэ хөрөнгийн дугаар бүртгэлтэй байна." });
    }
});

app.MapPost("/api/filters/{id}/schedule", (string id, ScheduleRequest request, FilterRepository repository) =>
{
    if (!DateOnly.TryParseExact(request.ScheduledDate, "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var scheduledDate))
    {
        return Results.BadRequest(new { message = "Товлосон огноо буруу байна." });
    }

    if (scheduledDate < DateOnly.FromDateTime(DateTime.Today))
    {
        return Results.BadRequest(new { message = "Өнгөрсөн өдөр товлох боломжгүй." });
    }

    return repository.Schedule(id, scheduledDate, request.Note)
        ? Results.Ok(new { message = "Солих үйлчилгээг товлолоо." })
        : Results.NotFound(new { message = "Шүүлтүүр олдсонгүй." });
});

app.MapPost("/api/filters/{id}/user-confirm", (string id, FilterRepository repository) =>
{
    return ApprovalResponse(repository.SetDecision(id, ApprovalStep.User, true), "Хэрэглэгч зөвшөөрлөө.");
});

app.MapPost("/api/filters/{id}/user-reject", (string id, FilterRepository repository) =>
{
    return ApprovalResponse(repository.SetDecision(id, ApprovalStep.User, false), "Хэрэглэгч хүсэлтээс татгалзлаа.");
});

app.MapPost("/api/filters/{id}/payment", (string id, PaymentRequest request, FilterRepository repository) =>
{
    return ApprovalResponse(repository.SetPayment(id, request.Paid),
        request.Paid ? "Төлбөр төлөгдсөнөөр бүртгэгдлээ." : "Төлбөр төлөгдөөгүй гэж бүртгэгдлээ.");
});

app.MapPost("/api/filters/{id}/admin-approve", (string id, FilterRepository repository) =>
{
    return ApprovalResponse(repository.SetDecision(id, ApprovalStep.Admin, true), "Админ зөвшөөрлөө.");
});

app.MapPost("/api/filters/{id}/admin-reject", (string id, FilterRepository repository) =>
{
    return ApprovalResponse(repository.SetDecision(id, ApprovalStep.Admin, false), "Админ хүсэлтээс татгалзлаа.");
});

app.MapGet("/api/feedback", (FilterRepository repository) =>
    Results.Ok(repository.GetFeedback()));

app.MapPost("/api/feedback", (FeedbackRequest request, FilterRepository repository) =>
{
    var name = request.Name?.Trim() ?? "";
    var email = request.Email?.Trim() ?? "";
    var category = request.Category?.Trim() ?? "";
    var message = request.Message?.Trim() ?? "";

    if (name.Length is < 2 or > 50 || Regex.IsMatch(name, @"\p{N}"))
    {
        return Results.BadRequest(new { message = "Нэрээ 2-50 тэмдэгтээр, тоогүй оруулна уу." });
    }

    if (!Regex.IsMatch(email, @"^[^@\s.]+@[^@\s.]+(?:\.[^@\s.]+)+$"))
    {
        return Results.BadRequest(new { message = "Зөв имэйл хаяг оруулна уу." });
    }

    if (message.Length is < 10 or > 500)
    {
        return Results.BadRequest(new { message = "Санал хүсэлт 10-500 тэмдэгттэй байна." });
    }

    var feedback = repository.CreateFeedback(name, email, category, message);
    return Results.Created($"/api/feedback/{feedback.Id}", feedback);
});

app.MapGet("/api/history", (string? company, FilterRepository repository) =>
    Results.Ok(repository.GetHistory(company)));

IResult ApprovalResponse(FilterView? filter, string successMessage)
{
    if (filter is null)
    {
        return Results.NotFound(new { message = "Шүүлтүүр олдсонгүй." });
    }

    return Results.Ok(new
    {
        filter,
        message = filter.Status == "replaced" ? "Гурван нөхцөл биелсэн тул шүүлтүүр солигдлоо." : successMessage
    });
}

app.Run();

public sealed record RegisterFilterRequest(
    string AssetCode,
    string Institution,
    string Location,
    string Model,
    string InstallDate,
    int IntervalMonths,
    string Company);

public sealed record ScheduleRequest(string ScheduledDate, string? Note);
public sealed record PaymentRequest(bool Paid);
public sealed record FeedbackRequest(string? Name, string? Email, string? Category, string? Message);
public enum ApprovalStep { User, Admin }
public sealed record CompanyOption(string Name);
public sealed record DashboardSummary(int Total, int Overdue, int DueSoon, int Scheduled);
public sealed record FilterView(
    string Id,
    string AssetCode,
    string Institution,
    string Location,
    string Model,
    string InstallDate,
    int IntervalMonths,
    string Company,
    string DueDate,
    int DaysRemaining,
    string Status,
    string? ScheduledDate,
    string? ScheduleNote,
    bool UserConfirmed,
    bool PaymentPaid,
    bool AdminApproved,
    bool RequestOpen,
    string? LastReplacedAt,
    bool UserRejected,
    bool PaymentDecided,
    bool AdminRejected);
public sealed record HistoryView(
    long Id,
    string AssetCode,
    string Institution,
    string Location,
    string Company,
    string Action,
    string ActionDate,
    string? PreviousDueDate,
    string? NextDueDate,
    string? Note);
public sealed record FeedbackView(long Id, string Name, string Category, string Message, string CreatedAt);

public sealed class FilterRepository
{
    private readonly string _connectionString;

    public FilterRepository(string databasePath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            ForeignKeys = true
        }.ToString();
        Initialize();
    }

    public IReadOnlyList<CompanyOption> GetCompanies()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT DISTINCT company FROM filters ORDER BY company;";
        using var reader = command.ExecuteReader();
        var companies = new List<CompanyOption>();
        while (reader.Read())
        {
            companies.Add(new CompanyOption(reader.GetString(0)));
        }

        return companies;
    }

    public IReadOnlyList<FilterView> GetFilters(string? search, string? company)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, asset_code, institution, location, model, install_date, interval_months,
                   company, scheduled_date, schedule_note, user_confirmed, payment_paid,
                   admin_approved, request_open, last_replaced_at, user_rejected,
                   payment_decided, admin_rejected
            FROM filters
            WHERE ($company IS NULL OR company = $company)
              AND ($search IS NULL OR asset_code LIKE $pattern OR institution LIKE $pattern
                   OR location LIKE $pattern OR model LIKE $pattern OR company LIKE $pattern)
            ORDER BY install_date;
            """;
        command.Parameters.AddWithValue("$company", string.IsNullOrWhiteSpace(company) ? DBNull.Value : company);
        command.Parameters.AddWithValue("$search", string.IsNullOrWhiteSpace(search) ? DBNull.Value : search);
        command.Parameters.AddWithValue("$pattern", $"%{search?.Trim()}%");

        using var reader = command.ExecuteReader();
        var filters = new List<FilterView>();
        while (reader.Read())
        {
            filters.Add(ReadFilter(reader));
        }

        return filters;
    }

    public DashboardSummary GetDashboard(string? company)
    {
        var filters = GetFilters(null, company);
        return new DashboardSummary(
            filters.Count,
            filters.Count(filter => filter.Status == "overdue"),
            filters.Count(filter => filter.Status == "due-soon"),
            filters.Count(filter => filter.ScheduledDate is not null));
    }

    public FilterView Register(RegisterFilterRequest request, DateOnly installDate)
    {
        var id = Guid.NewGuid().ToString("N");
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO filters (id, asset_code, institution, location, model, install_date,
                                 interval_months, company)
            VALUES ($id, $assetCode, $institution, $location, $model, $installDate,
                    $intervalMonths, $company);
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$assetCode", request.AssetCode.Trim());
        command.Parameters.AddWithValue("$institution", request.Institution.Trim());
        command.Parameters.AddWithValue("$location", request.Location.Trim());
        command.Parameters.AddWithValue("$model", request.Model.Trim());
        command.Parameters.AddWithValue("$installDate", Format(installDate));
        command.Parameters.AddWithValue("$intervalMonths", request.IntervalMonths);
        command.Parameters.AddWithValue("$company", request.Company.Trim());
        command.ExecuteNonQuery();

        using var select = connection.CreateCommand();
        select.CommandText = """
            SELECT id, asset_code, institution, location, model, install_date, interval_months,
                   company, scheduled_date, schedule_note, user_confirmed, payment_paid,
                   admin_approved, request_open, last_replaced_at, user_rejected,
                   payment_decided, admin_rejected
            FROM filters WHERE id = $id;
            """;
        select.Parameters.AddWithValue("$id", id);
        using var reader = select.ExecuteReader();
        reader.Read();
        return ReadFilter(reader);
    }

    public bool Schedule(string id, DateOnly scheduledDate, string? note)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();
        var filter = GetFilterForUpdate(connection, transaction, id);
        if (filter is null)
        {
            return false;
        }

        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE filters
            SET scheduled_date = $scheduledDate,
                schedule_note = $note,
                user_confirmed = CASE WHEN request_open = 0 THEN 0 ELSE user_confirmed END,
                user_rejected = CASE WHEN request_open = 0 THEN 0 ELSE user_rejected END,
                payment_paid = CASE WHEN request_open = 0 THEN 0 ELSE payment_paid END,
                payment_decided = CASE WHEN request_open = 0 THEN 0 ELSE payment_decided END,
                admin_approved = CASE WHEN request_open = 0 THEN 0 ELSE admin_approved END,
                admin_rejected = CASE WHEN request_open = 0 THEN 0 ELSE admin_rejected END,
                request_open = 1
            WHERE id = $id;
            """;
        command.Parameters.AddWithValue("$scheduledDate", Format(scheduledDate));
        command.Parameters.AddWithValue("$note", string.IsNullOrWhiteSpace(note) ? DBNull.Value : note.Trim());
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();

        AddHistory(connection, transaction, filter, "Товлосон", DateOnly.FromDateTime(DateTime.Today),
            filter.DueDate, filter.DueDate, note);
        transaction.Commit();
        return true;
    }

    public FilterView? SetDecision(string id, ApprovalStep step, bool approved)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();
        var filter = GetFilterForUpdate(connection, transaction, id);
        if (filter is null)
        {
            return null;
        }

        if (!filter.RequestOpen)
        {
            using var start = connection.CreateCommand();
            start.Transaction = transaction;
            start.CommandText = """
                UPDATE filters
                SET user_confirmed = 0, user_rejected = 0, payment_paid = 0, payment_decided = 0,
                    admin_approved = 0, admin_rejected = 0, request_open = 1
                WHERE id = $id;
                """;
            start.Parameters.AddWithValue("$id", id);
            start.ExecuteNonQuery();
            filter = GetFilterForUpdate(connection, transaction, id)
                ?? throw new InvalidOperationException("Шүүлтүүр шинэчлэлтийн үед олдсонгүй.");
        }

        var alreadyApproved = step switch
        {
            ApprovalStep.User => approved ? filter.UserConfirmed : filter.UserRejected,
            ApprovalStep.Admin => approved ? filter.AdminApproved : filter.AdminRejected,
            _ => throw new ArgumentOutOfRangeException(nameof(step))
        };
        if (!alreadyApproved)
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = step switch
            {
                ApprovalStep.User when approved =>
                    "UPDATE filters SET user_confirmed = 1, user_rejected = 0, request_open = 1 WHERE id = $id;",
                ApprovalStep.User =>
                    "UPDATE filters SET user_confirmed = 0, user_rejected = 1, request_open = 0 WHERE id = $id;",
                ApprovalStep.Admin when approved =>
                    "UPDATE filters SET admin_approved = 1, admin_rejected = 0, request_open = 1 WHERE id = $id;",
                ApprovalStep.Admin =>
                    "UPDATE filters SET admin_approved = 0, admin_rejected = 1, request_open = 0 WHERE id = $id;",
                _ => throw new ArgumentOutOfRangeException(nameof(step))
            };
            command.Parameters.AddWithValue("$id", id);
            command.ExecuteNonQuery();

            var action = step switch
            {
                ApprovalStep.User when approved => "Хэрэглэгч зөвшөөрсөн",
                ApprovalStep.User => "Хэрэглэгч татгалзсан",
                ApprovalStep.Admin when approved => "Админ зөвшөөрсөн",
                ApprovalStep.Admin => "Админ татгалзсан",
                _ => throw new ArgumentOutOfRangeException(nameof(step))
            };
            AddHistory(connection, transaction, filter, action, DateOnly.FromDateTime(DateTime.Today),
                filter.DueDate, filter.DueDate, null);
        }

        var updated = GetFilterForUpdate(connection, transaction, id)
            ?? throw new InvalidOperationException("Шүүлтүүр шинэчлэлтийн үед олдсонгүй.");
        var result = CompleteIfReady(connection, transaction, updated);
        transaction.Commit();
        return result;
    }

    public FilterView? SetPayment(string id, bool paid)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();
        var filter = GetFilterForUpdate(connection, transaction, id);
        if (filter is null)
        {
            return null;
        }

        if (!filter.PaymentDecided || filter.PaymentPaid != paid)
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE filters SET payment_paid = $paid, payment_decided = 1 WHERE id = $id;
                """;
            command.Parameters.AddWithValue("$paid", paid ? 1 : 0);
            command.Parameters.AddWithValue("$id", id);
            command.ExecuteNonQuery();
            AddHistory(connection, transaction, filter,
                paid ? "Төлбөр төлсөн" : "Төлбөр төлөөгүй",
                DateOnly.FromDateTime(DateTime.Today), filter.DueDate, filter.DueDate, null);
        }

        var updated = GetFilterForUpdate(connection, transaction, id)
            ?? throw new InvalidOperationException("Шүүлтүүр шинэчлэлтийн үед олдсонгүй.");
        var result = CompleteIfReady(connection, transaction, updated);
        transaction.Commit();
        return result;
    }

    private FilterView CompleteIfReady(
        SqliteConnection connection,
        SqliteTransaction transaction,
        FilterView filter)
    {
        if (!filter.RequestOpen || !filter.UserConfirmed || filter.UserRejected || !filter.PaymentPaid ||
            !filter.PaymentDecided || !filter.AdminApproved || filter.AdminRejected)
        {
            return filter;
        }

        var replacedAt = DateOnly.FromDateTime(DateTime.Today);
        var nextDueDate = replacedAt.AddMonths(filter.IntervalMonths);
        using (var complete = connection.CreateCommand())
        {
            complete.Transaction = transaction;
            complete.CommandText = """
                UPDATE filters
                SET install_date = $installDate, last_replaced_at = $replacedAt,
                    scheduled_date = NULL, schedule_note = NULL, request_open = 0
                WHERE id = $id;
                """;
            complete.Parameters.AddWithValue("$installDate", Format(replacedAt));
            complete.Parameters.AddWithValue("$replacedAt", Format(replacedAt));
            complete.Parameters.AddWithValue("$id", filter.Id);
            complete.ExecuteNonQuery();
        }
        AddHistory(connection, transaction, filter, "Сольсон", replacedAt,
            filter.DueDate, Format(nextDueDate), "Хэрэглэгч зөвшөөрч, төлбөр төлж, админ зөвшөөрсөн.");
        return GetFilterForUpdate(connection, transaction, filter.Id)
            ?? throw new InvalidOperationException("Шүүлтүүр шинэчлэлтийн үед олдсонгүй.");
    }

    public IReadOnlyList<HistoryView> GetHistory(string? company)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT h.id, f.asset_code, f.institution, f.location, h.company, h.action, h.action_date,
                   h.previous_due_date, h.next_due_date, h.note
            FROM history h
            JOIN filters f ON f.id = h.filter_id
            WHERE ($company IS NULL OR h.company = $company)
            ORDER BY h.action_date DESC, h.id DESC
            LIMIT 200;
            """;
        command.Parameters.AddWithValue("$company", string.IsNullOrWhiteSpace(company) ? DBNull.Value : company);

        using var reader = command.ExecuteReader();
        var history = new List<HistoryView>();
        while (reader.Read())
        {
            history.Add(new HistoryView(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.GetString(5), reader.GetString(6),
                ReadNullableString(reader, 7), ReadNullableString(reader, 8), ReadNullableString(reader, 9)));
        }

        return history;
    }

    public FeedbackView CreateFeedback(string name, string email, string category, string message)
    {
        var createdAt = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO feedback (name, email, category, message, created_at)
            VALUES ($name, $email, $category, $message, $createdAt);
            SELECT last_insert_rowid();
            """;
        command.Parameters.AddWithValue("$name", name);
        command.Parameters.AddWithValue("$email", email);
        command.Parameters.AddWithValue("$category", category);
        command.Parameters.AddWithValue("$message", message);
        command.Parameters.AddWithValue("$createdAt", createdAt);
        var id = Convert.ToInt64(command.ExecuteScalar(), CultureInfo.InvariantCulture);
        return new FeedbackView(id, name, category, message, createdAt);
    }

    public IReadOnlyList<FeedbackView> GetFeedback()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, name, category, message, created_at
            FROM feedback ORDER BY id DESC LIMIT 50;
            """;
        using var reader = command.ExecuteReader();
        var feedback = new List<FeedbackView>();
        while (reader.Read())
        {
            feedback.Add(new FeedbackView(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                reader.GetString(3), reader.GetString(4)));
        }

        return feedback;
    }

    private void Initialize()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS filters (
                id TEXT PRIMARY KEY,
                asset_code TEXT NOT NULL UNIQUE,
                institution TEXT NOT NULL,
                location TEXT NOT NULL,
                model TEXT NOT NULL,
                install_date TEXT NOT NULL,
                interval_months INTEGER NOT NULL CHECK (interval_months BETWEEN 1 AND 60),
                company TEXT NOT NULL,
                scheduled_date TEXT,
                schedule_note TEXT,
                user_confirmed INTEGER NOT NULL DEFAULT 0,
                payment_paid INTEGER NOT NULL DEFAULT 0,
                admin_approved INTEGER NOT NULL DEFAULT 0,
                request_open INTEGER NOT NULL DEFAULT 0,
                last_replaced_at TEXT,
                user_rejected INTEGER NOT NULL DEFAULT 0,
                payment_decided INTEGER NOT NULL DEFAULT 0,
                admin_rejected INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filter_id TEXT NOT NULL REFERENCES filters(id) ON DELETE CASCADE,
                company TEXT NOT NULL,
                action TEXT NOT NULL,
                action_date TEXT NOT NULL,
                previous_due_date TEXT,
                next_due_date TEXT,
                note TEXT
            );
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                category TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """;
        command.ExecuteNonQuery();
        EnsureColumn(connection, "user_confirmed", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(connection, "payment_paid", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(connection, "admin_approved", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(connection, "request_open", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(connection, "last_replaced_at", "TEXT");
        EnsureColumn(connection, "user_rejected", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(connection, "payment_decided", "INTEGER NOT NULL DEFAULT 0");
        EnsureColumn(connection, "admin_rejected", "INTEGER NOT NULL DEFAULT 0");
        Seed(connection);
    }

    private static void EnsureColumn(SqliteConnection connection, string name, string definition)
    {
        using (var inspect = connection.CreateCommand())
        {
            inspect.CommandText = "PRAGMA table_info(filters);";
            using var reader = inspect.ExecuteReader();
            while (reader.Read())
            {
                if (reader.GetString(1) == name)
                {
                    return;
                }
            }
        }

        using var alter = connection.CreateCommand();
        alter.CommandText = $"ALTER TABLE filters ADD COLUMN {name} {definition};";
        alter.ExecuteNonQuery();
    }

    private static void Seed(SqliteConnection connection)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var samples = new[]
        {
            new SeedFilter("SHUTIS-001", "ШУТИС", "Хичээлийн 1-р байр · 1 давхар", "Aqua Pro 300", today.AddDays(2).AddMonths(-6), 6, "Билэг ус цэвэршүүлэгч"),
            new SeedFilter("SHUTIS-002", "ШУТИС", "Хичээлийн 2-р байр · номын сан", "Aqua Pro 300", today.AddDays(5).AddMonths(-6), 6, "Билэг ус цэвэршүүлэгч"),
            new SeedFilter("SHUTIS-003", "ШУТИС", "МХТС · багш нарын өрөө", "PureFlow X2", today.AddMonths(-5), 6, "Билэг ус цэвэршүүлэгч"),
            new SeedFilter("SHUTIS-004", "ШУТИС", "ГУУС · лаборатори", "PureFlow X2", today.AddMonths(-4), 6, "Aqua Service"),
            new SeedFilter("SHUTIS-005", "ШУТИС", "Төв байр · захиргаа", "Aqua Pro 300", today.AddMonths(-2), 6, "Aqua Service"),
            new SeedFilter("SHUTIS-006", "ШУТИС", "Хичээлийн 3-р байр · 2 давхар", "PureFlow X2", today.AddDays(1).AddMonths(-6), 6, "Билэг ус цэвэршүүлэгч")
        };

        foreach (var sample in samples)
        {
            using var exists = connection.CreateCommand();
            exists.CommandText = "SELECT 1 FROM filters WHERE asset_code = $assetCode LIMIT 1;";
            exists.Parameters.AddWithValue("$assetCode", sample.AssetCode);
            if (exists.ExecuteScalar() is not null)
            {
                continue;
            }

            using var insert = connection.CreateCommand();
            insert.CommandText = """
                INSERT INTO filters (id, asset_code, institution, location, model, install_date,
                                     interval_months, company)
                VALUES ($id, $assetCode, $institution, $location, $model, $installDate, $interval, $company);
                """;
            insert.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("N"));
            insert.Parameters.AddWithValue("$assetCode", sample.AssetCode);
            insert.Parameters.AddWithValue("$institution", sample.Institution);
            insert.Parameters.AddWithValue("$location", sample.Location);
            insert.Parameters.AddWithValue("$model", sample.Model);
            insert.Parameters.AddWithValue("$installDate", Format(sample.InstallDate));
            insert.Parameters.AddWithValue("$interval", sample.IntervalMonths);
            insert.Parameters.AddWithValue("$company", sample.Company);
            insert.ExecuteNonQuery();
        }
    }

    private static FilterView ReadFilter(SqliteDataReader reader)
    {
        var installDate = DateOnly.ParseExact(reader.GetString(5), "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var dueDate = installDate.AddMonths(reader.GetInt32(6));
        var daysRemaining = dueDate.DayNumber - DateOnly.FromDateTime(DateTime.Today).DayNumber;
        var userConfirmed = reader.GetInt32(10) == 1;
        var paymentPaid = reader.GetInt32(11) == 1;
        var adminApproved = reader.GetInt32(12) == 1;
        var requestOpen = reader.GetInt32(13) == 1;
        var lastReplacedAt = ReadNullableString(reader, 14);
        var userRejected = reader.GetInt32(15) == 1;
        var paymentDecided = reader.GetInt32(16) == 1;
        var adminRejected = reader.GetInt32(17) == 1;
        var status = daysRemaining < 0
            ? "overdue"
            : daysRemaining <= 7
                ? "due-soon"
                : lastReplacedAt is not null && !requestOpen ? "replaced" : "ok";
        return new FilterView(
            reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
            reader.GetString(4), Format(installDate), reader.GetInt32(6), reader.GetString(7),
            Format(dueDate), daysRemaining, status, ReadNullableString(reader, 8), ReadNullableString(reader, 9),
            userConfirmed, paymentPaid, adminApproved, requestOpen, lastReplacedAt,
            userRejected, paymentDecided, adminRejected);
    }

    private static FilterView? GetFilterForUpdate(SqliteConnection connection, SqliteTransaction transaction, string id)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT id, asset_code, institution, location, model, install_date, interval_months,
                   company, scheduled_date, schedule_note, user_confirmed, payment_paid,
                   admin_approved, request_open, last_replaced_at, user_rejected,
                   payment_decided, admin_rejected
            FROM filters WHERE id = $id;
            """;
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadFilter(reader) : null;
    }

    private static void AddHistory(
        SqliteConnection connection,
        SqliteTransaction transaction,
        FilterView filter,
        string action,
        DateOnly actionDate,
        string? previousDueDate,
        string? nextDueDate,
        string? note)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO history (filter_id, company, action, action_date, previous_due_date, next_due_date, note)
            VALUES ($filterId, $company, $action, $actionDate, $previousDueDate, $nextDueDate, $note);
            """;
        command.Parameters.AddWithValue("$filterId", filter.Id);
        command.Parameters.AddWithValue("$company", filter.Company);
        command.Parameters.AddWithValue("$action", action);
        command.Parameters.AddWithValue("$actionDate", Format(actionDate));
        command.Parameters.AddWithValue("$previousDueDate", previousDueDate is null ? DBNull.Value : previousDueDate);
        command.Parameters.AddWithValue("$nextDueDate", nextDueDate is null ? DBNull.Value : nextDueDate);
        command.Parameters.AddWithValue("$note", string.IsNullOrWhiteSpace(note) ? DBNull.Value : note.Trim());
        command.ExecuteNonQuery();
    }

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        return connection;
    }

    private static string Format(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string? ReadNullableString(SqliteDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);

    private sealed record SeedFilter(
        string AssetCode,
        string Institution,
        string Location,
        string Model,
        DateOnly InstallDate,
        int IntervalMonths,
        string Company);
}
