# ШУТИС ус цэвэршүүлэгчийн үйлчилгээний бүртгэл

ШУТИС-ийн ус цэвэршүүлэгч төхөөрөмжүүдийн бүртгэл, шүүлтүүр солих хугацаа, зөвшөөрөл болон солилтын түүхийг удирдах хичээлийн demo систем.

## Боломжууд

- Төхөөрөмж, суурилуулсан огноо, солих давтамж болон байршлыг бүртгэх
- Солих хугацаа 7 хоног дутуу үед мэдэгдлийн жагсаалтад харуулах
- Хэрэглэгч зөвшөөрөх эсвэл татгалзах; зөвшөөрвөл demo QR харуулж төлсөн/төлөөгүйг бүртгэх
- Төлбөр төлөгдсөний дараа админ зөвшөөрөх эсвэл татгалзах
- Хэрэглэгч зөвшөөрч, төлбөр төлж, админ зөвшөөрсөн үед л шүүлтүүрийг солигдсонд тооцох
- Үйлчилгээний түүх болон feedback-ийг SQLite өгөгдлийн санд хадгалах
- Цайвар болон бараан хөх theme сонгож хадгалах

QR код нь "WATERCARE DEMO PAYMENT - NOT A REAL PAYMENT" гэсэн утга уншуулах зориулалттай, бодит данс эсвэл төлбөрийн гүйлгээ биш. Компанийг UI-ээс нуусан боловч хуучин өгөгдөл дэх компанийн утгууд өгөгдлийн санд хадгалагдана. Дээд цэсний хэрэглэгч/админы үүргийн сонголт нь demo бөгөөд нэвтрэлт, эрхийн хамгаалалт биш.

GitHub Pages дээрх хувилбар браузерын `localStorage` ашиглан demo өгөгдөл хадгална. ASP.NET Core хувилбарыг ажиллуулахад өгөгдөл SQLite-д хадгалагдана.

## Ажиллуулах

Шаардлага: .NET 10 SDK.

```powershell
dotnet run --urls http://localhost:5089
```

Дараа нь `http://localhost:5089` хаягийг браузераар нээнэ. SQLite өгөгдлийн сан анх ажиллахад `App_Data/watercare.db` замд үүсэж, жишээ төхөөрөмжүүд автоматаар бүртгэгдэнэ.

Нийтийн статик demo: <https://garid-dev.github.io/webbiydaalt/>

## API

- `GET /api/dashboard?company=...`
- `GET /api/filters?search=...&company=...`
- `POST /api/filters`
- `POST /api/filters/{id}/schedule`
- `POST /api/filters/{id}/user-confirm`
- `POST /api/filters/{id}/user-reject`
- `POST /api/filters/{id}/payment` with `{"paid":true|false}`
- `POST /api/filters/{id}/admin-approve`
- `POST /api/filters/{id}/admin-reject`
- `GET /api/history?company=...`
- `GET /api/feedback`
- `POST /api/feedback`
