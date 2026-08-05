namespace TemplateContracts;

@doc("Day of the week a recurring thread loop may fire on. Named days rather than an index because the WIRE is what the console renders and what the DB stores: an integer would need a base (0=Sunday? 1=Monday?) agreed in three places, and getting it wrong is a silent one-day shift, not a type error. Ordered Monday-first, which is the order the console's weekday picker renders.")
enum DayOfWeek {
  MONDAY: "MONDAY",
  TUESDAY: "TUESDAY",
  WEDNESDAY: "WEDNESDAY",
  THURSDAY: "THURSDAY",
  FRIDAY: "FRIDAY",
  SATURDAY: "SATURDAY",
  SUNDAY: "SUNDAY",
}
