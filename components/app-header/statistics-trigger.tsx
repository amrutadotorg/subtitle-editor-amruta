"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IconChartBar } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import StatisticsDialog from "./statistics-dialog";

export default function StatisticsTrigger() {
  const t = useTranslations();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="statistics-trigger"
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              aria-label={t("navigation.statistics")}
              onClick={() => setIsDialogOpen(true)}
            >
              <IconChartBar size={20} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("navigation.statistics")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <StatisticsDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
