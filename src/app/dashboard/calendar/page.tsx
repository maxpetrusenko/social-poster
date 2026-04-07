import { db } from "@/db";
import { posts } from "@/db/schema";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { gte, lt, and, isNotNull } from "drizzle-orm";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  publishing: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  return days;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const monthParam = params.month || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = monthParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;

  const nextMonth = new Date(year, month + 1, 1);
  const nextMonthStr = nextMonth.toISOString().slice(0, 7);
  const prevMonth = new Date(year, month, 0);
  const prevMonthStr = prevMonth.toISOString().slice(0, 7);

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const scheduledPosts = await db
    .select()
    .from(posts)
    .where(
      and(
        isNotNull(posts.scheduledAt),
        gte(posts.scheduledAt, monthStart),
        lt(posts.scheduledAt, monthEnd)
      )
    );

  const postsByDay = new Map<number, typeof scheduledPosts>();
  scheduledPosts.forEach((post) => {
    if (post.scheduledAt) {
      const day = new Date(post.scheduledAt).getDate();
      if (!postsByDay.has(day)) {
        postsByDay.set(day, []);
      }
      postsByDay.get(day)!.push(post);
    }
  });

  const days = getCalendarDays(year, month);
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const monthName = new Date(year, month).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">Calendar</h1>
        <p className="text-sm text-gray-600 mt-1">
          View scheduled posts by date
        </p>
      </div>

      {/* Calendar Navigation */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">{monthName}</h2>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/calendar?month=${prevMonthStr}`}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Link>
          <Link
            href="/dashboard/calendar"
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Today
          </Link>
          <Link
            href={`/dashboard/calendar?month=${nextMonthStr}`}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Day Labels */}
        <div className="grid grid-cols-7 gap-0 border-b border-gray-200 bg-gray-50">
          {dayLabels.map((label) => (
            <div
              key={label}
              className="p-4 text-center text-sm font-semibold text-gray-900"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-0 divide-x divide-y divide-gray-200">
          {days.map((day, index) => (
            <div
              key={index}
              className={`min-h-32 p-3 ${
                day ? "bg-white" : "bg-gray-50"
              }`}
            >
              {day && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {day.getDate()}
                    </span>
                    {postsByDay.has(day.getDate()) && (
                      <span className="text-xs text-gray-500">
                        {postsByDay.get(day.getDate())?.length} posts
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {postsByDay.get(day.getDate())?.map((post) => (
                      <Link
                        key={post.id}
                        href={`/dashboard/posts/${post.id}`}
                        className={`block text-xs px-2 py-1 rounded truncate transition-colors ${
                          STATUS_COLORS[post.status] || STATUS_COLORS.draft
                        } hover:opacity-80`}
                        title={post.title || post.content}
                      >
                        {post.title || post.content.slice(0, 20)}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
