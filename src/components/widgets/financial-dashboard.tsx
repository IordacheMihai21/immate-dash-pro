/**
 * Adapted from "Financial Dashboard" by ravikatiyar162 (21st.dev).
 * Source: https://21st.dev/@ravikatiyar162/components/financial-dashboard
 * Localized to Romanian / RON for IMMapp; motion import swapped to `motion/react`.
 */
import * as React from "react";
import { motion } from "motion/react";
import { ChevronRight, History, Library, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type QuickAction = {
  icon: React.ElementType;
  title: string;
  description: string;
};

type Activity = {
  icon: React.ReactNode;
  title: string;
  time: string;
  amount: number;
};

type ServiceItem = {
  icon: React.ElementType;
  title: string;
  description: string;
  isPremium?: boolean;
  hasAction?: boolean;
};

interface FinancialDashboardProps {
  quickActions: QuickAction[];
  recentActivity: Activity[];
  financialServices: ServiceItem[];
  className?: string;
}

const IconWrapper = ({
  icon: Icon,
  className,
}: {
  icon: React.ElementType;
  className?: string;
}) => (
  <div className={cn("flex items-center justify-center rounded-full p-2", className)}>
    <Icon className="h-5 w-5" />
  </div>
);

export function FinancialDashboard({
  quickActions,
  recentActivity,
  financialServices,
  className,
}: FinancialDashboardProps) {
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className={cn(
        "rounded-2xl border bg-card font-sans text-card-foreground shadow-sm",
        className,
      )}
    >
      <div className="p-4 md:p-6">
        <motion.div variants={itemVariants} className="relative mb-6">
          <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Caută facturi, plăți sau o comandă..."
            className="w-full rounded-lg border bg-background py-2.5 pr-4 pl-10 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          />
          <kbd className="absolute top-1/2 right-3 hidden -translate-y-1/2 items-center justify-center rounded-md bg-muted p-1 font-mono text-xs text-muted-foreground sm:inline-flex">
            ⌘K
          </kbd>
        </motion.div>

        <motion.div
          variants={containerVariants}
          className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {quickActions.map((action) => (
            <motion.div
              key={action.title}
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              className="group cursor-pointer rounded-xl p-3 text-center transition-colors hover:bg-muted"
            >
              <IconWrapper
                icon={action.icon}
                className="mx-auto mb-2 bg-muted group-hover:bg-background"
              />
              <p className="text-sm font-medium">{action.title}</p>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={itemVariants} className="mb-6">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Activitate recentă</h2>
          </div>
          <motion.ul variants={containerVariants} className="space-y-4">
            {recentActivity.map((activity) => (
              <motion.li
                key={activity.title}
                variants={itemVariants}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  {React.isValidElement(activity.icon) ? (
                    activity.icon
                  ) : (
                    <IconWrapper
                      icon={activity.icon as React.ElementType}
                      className="bg-muted text-muted-foreground"
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded p-1 px-2 font-mono text-sm",
                    activity.amount > 0
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {activity.amount > 0 ? "+" : "-"}
                  {Math.abs(activity.amount).toFixed(2)} RON
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>

        <motion.div variants={itemVariants}>
          <div className="mb-4 flex items-center gap-2">
            <Library className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Servicii</h2>
          </div>
          <motion.div variants={containerVariants} className="space-y-2">
            {financialServices.map((service) => (
              <motion.div
                key={service.title}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                className="flex cursor-pointer items-center justify-between rounded-xl p-3 transition-all hover:bg-muted"
              >
                <div className="flex items-center gap-3">
                  <IconWrapper icon={service.icon} className="bg-muted-foreground/10" />
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {service.title}
                      {service.isPremium && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          Premium
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{service.description}</p>
                  </div>
                </div>
                {service.hasAction && <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
