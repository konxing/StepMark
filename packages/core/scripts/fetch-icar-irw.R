#!/usr/bin/env Rscript
# Research-only ephemeral IRW extract. No item text, keys or participant rows
# are committed. The IRW version is pinned; source mapping must be audited.
if (length(commandArgs(trailingOnly=TRUE)) != 1L) stop("expected output CSV path")
if (!requireNamespace("irw",quietly=TRUE)) stop("irw package not installed")
if (as.character(utils::packageVersion("irw")) != "1.4.0") stop("unreviewed irw package version")
library(irw)
irw_set_version("item_response_warehouse", "v81.0")
x <- irw_fetch("icar_sapa")
if (!all(c("id","item","resp") %in% names(x))) stop("IRW schema changed")
x <- x[,c("id","item","resp")]
if (nrow(x)!=1199896 || length(unique(x$id))!=95236 || length(unique(x$item))!=60)
  stop("IRW source counts changed; inspect before proceeding")
if (!all(!is.na(x$resp) & x$resp %in% c(0,1))) stop("unexpected ICAR response values")
utils::write.csv(x,commandArgs(trailingOnly=TRUE)[1],row.names=FALSE,na="")
cat("Pinned IRW item_response_warehouse v81.0 and binary response count checked; temporary CSV written\n")
